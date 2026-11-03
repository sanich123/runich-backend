import { Inject, Injectable, Optional } from '@nestjs/common';
import { StorageCoreService } from './storage-core.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { MediaUploadManifestEntry, PhotoUploadOptions } from '../shared/types';

@Injectable()
export class StorageModerationService {
  constructor(
    private readonly core: StorageCoreService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  async uploadForModeration(input: {
    userId: string;
    mediaId: string;
    role: MediaUploadManifestEntry['role'];
    scope: Exclude<NonNullable<PhotoUploadOptions['scope']>, 'feedback'>;
    extension: string;
    contentType: string;
    contentLength: number;
    body: Buffer | Uint8Array | Readable;
    blurhash?: string | null;
  }) {
    if (!this.prisma) throw new ServiceUnavailableException('Проверка загружаемых медиафайлов не настроена');
    const publicBucket = this.core.assertConfigured();
    const quarantineBucket = this.assertQuarantineConfigured();
    if (publicBucket === quarantineBucket && !this.core.settings.quarantinePrefix) {
      throw new ServiceUnavailableException('Для карантина в основном S3-бакете задайте S3_QUARANTINE_PREFIX');
    }

    const assetId = randomUUID();
    const quarantineKey = `${this.core.settings.quarantinePrefix}${input.userId}/${assetId}.${input.extension}`;
    const previewUrl = await this.getQuarantinePreviewUrl(quarantineKey);
    await this.core.measureS3('putQuarantineObject', () =>
      this.core.client.send(
        new PutObjectCommand({
          Bucket: quarantineBucket,
          Key: quarantineKey,
          Body: input.body,
          ContentLength: input.contentLength,
          ContentType: input.contentType,
          CacheControl: 'private, no-store',
        }),
      ),
    );

    try {
      const asset = await this.prisma.mediaModerationAsset.create({
        data: {
          id: assetId,
          ownerId: input.userId,
          mediaId: input.mediaId,
          role: input.role,
          scope: input.scope,
          quarantineKey,
          contentType: input.contentType,
          blurhash: input.blurhash ?? null,
          byteSize: input.contentLength,
        },
        select: { id: true, status: true, contentType: true },
      });
      return {
        assetId: asset.id,
        status: asset.status,
        contentType: asset.contentType,
        previewUrl,
        ...(input.blurhash ? { blurhash: input.blurhash } : {}),
      };
    } catch (error) {
      await this.deleteQuarantineObject(quarantineKey).catch(() => undefined);
      throw error;
    }
  }

  async deleteQuarantineAsset(assetId: string, ownerId: string) {
    if (!this.prisma) return;
    const asset = await this.prisma.mediaModerationAsset.findFirst({ where: { id: assetId, ownerId } });
    if (!asset) return;
    await this.deleteQuarantineObject(asset.quarantineKey);
    if (asset.publishedKey) await this.core.deleteObjectByKey(asset.publishedKey);
    await this.prisma.mediaModerationAsset.delete({ where: { id: assetId } });
  }

  async deleteUnattachedModerationAsset(ownerId: string, assetId: string) {
    if (!this.prisma) throw new ServiceUnavailableException('Хранилище загруженных медиа недоступно');
    const asset = await this.prisma.mediaModerationAsset.findFirst({
      where: { id: assetId, ownerId, scope: 'activity' },
    });
    if (!asset) throw new BadRequestException('Загруженный файл не найден');
    const linkedMedia = await this.prisma.activityMedia.findFirst({
      where: { OR: [{ mediaModerationAssetId: assetId }, { thumbnailModerationAssetId: assetId }] },
      select: { id: true },
    });
    if (linkedMedia) throw new BadRequestException('Файл уже добавлен к тренировке');
    await this.deleteQuarantineObject(asset.quarantineKey);
    if (asset.publishedKey) await this.core.deleteObjectByKey(asset.publishedKey);
    await this.prisma.mediaModerationAsset.delete({ where: { id: assetId } });
  }

  async deleteGroupPhotoAsset(ownerId: string, assetId: string | null) {
    if (!this.prisma || !assetId) return;
    const asset = await this.prisma.mediaModerationAsset.findFirst({
      where: { id: assetId, ownerId, scope: 'group' },
    });
    if (!asset) return;
    await this.deleteQuarantineObject(asset.quarantineKey);
    if (asset.publishedKey) await this.core.deleteObjectByKey(asset.publishedKey);
    await this.prisma.mediaModerationAsset.delete({ where: { id: assetId } });
  }

  async deleteActivityModerationAssets(ownerId: string, assetIds: Array<string | null | undefined>) {
    const uniqueAssetIds = [...new Set(assetIds.filter((assetId): assetId is string => Boolean(assetId)))];
    for (const assetId of uniqueAssetIds) {
      await this.deleteQuarantineAsset(assetId, ownerId);
    }
  }

  async deleteQuarantineObject(key: string) {
    const bucket = this.assertQuarantineConfigured();
    await this.core.measureS3('deleteQuarantineObject', () =>
      this.core.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
    );
  }

  assertQuarantineConfigured() {
    if (!this.core.settings.quarantineBucket || !this.core.settings.accessKey || !this.core.settings.secretKey) {
      throw new ServiceUnavailableException('Карантинное S3-хранилище не настроено');
    }
    if (this.core.settings.bucket === this.core.settings.quarantineBucket && !this.core.settings.quarantinePrefix) {
      throw new ServiceUnavailableException('Для карантина в основном S3-бакете задайте S3_QUARANTINE_PREFIX');
    }
    return this.core.settings.quarantineBucket;
  }

  async getModerationUploadStatuses(ownerId: string, assetIds: string[]) {
    if (!this.prisma) throw new ServiceUnavailableException('Хранилище статусов загрузки недоступно');
    const assets = (await this.prisma.mediaModerationAsset.findMany({
      where: { ownerId, id: { in: assetIds } },
      select: { id: true, status: true, publishedKey: true, contentType: true },
    })) as Array<{ id: string; status: string; publishedKey: string | null; contentType: string }>;
    return {
      items: assets.map((asset) => ({
        assetId: asset.id,
        status: asset.status,
        ...(asset.status === 'approved' && asset.publishedKey
          ? { url: this.core.getPublicUrl(asset.publishedKey) }
          : {}),
        contentType: asset.contentType,
      })),
    };
  }

  async getOwnerModerationPreviewUrl(ownerId: string, assetId: string | null | undefined) {
    if (!assetId) return null;
    return (await this.getOwnerModerationPreviewUrls(ownerId, [assetId]))[assetId] ?? null;
  }

  async getOwnerModerationPreviewUrls(ownerId: string, assetIds: Array<string | null | undefined>) {
    if (!this.prisma) return {};
    const uniqueAssetIds = [...new Set(assetIds.filter((assetId): assetId is string => Boolean(assetId)))];
    if (!uniqueAssetIds.length) return {};
    const assets = await this.prisma.mediaModerationAsset.findMany({
      where: { ownerId, id: { in: uniqueAssetIds } },
      select: { id: true, status: true, quarantineKey: true, publishedKey: true },
    });
    const previewUrls: Record<string, string> = {};
    await Promise.all(
      assets.map(async (asset: { id: string; status: string; quarantineKey: string; publishedKey: string | null }) => {
        if (asset.status === 'approved' && asset.publishedKey) {
          previewUrls[asset.id] = this.core.getPublicUrl(asset.publishedKey);
        } else if (['queued', 'processing', 'review_required', 'failed'].includes(asset.status)) {
          previewUrls[asset.id] = await this.getQuarantinePreviewUrl(asset.quarantineKey);
        }
      }),
    );
    return previewUrls;
  }

  async downloadQuarantineObjectToFile(key: string, filePath: string) {
    const bucket = this.assertQuarantineConfigured();
    await mkdir(dirname(filePath), { recursive: true });
    const response = await this.core.measureS3('getQuarantineObject', () =>
      this.core.client.send(new GetObjectCommand({ Bucket: bucket, Key: key })),
    );
    if (!response.Body) throw new Error(`S3 не вернул карантинный объект ${key}`);
    await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(filePath));
  }

  async getQuarantinePreviewUrl(key: string) {
    const bucket = this.assertQuarantineConfigured();
    return await getSignedUrl(this.core.client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 600 });
  }

  async approveModerationAsset(assetId: string, reviewerId?: string, reviewNote?: string) {
    if (!this.prisma) throw new ServiceUnavailableException('Хранилище статусов загрузки недоступно');
    const asset = await this.prisma.mediaModerationAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new BadRequestException('Загруженный файл не найден');
    if (asset.status === 'approved' && asset.publishedKey) {
      await this.syncLinkedActivityMedia(assetId, this.core.getPublicUrl(asset.publishedKey), 'approved');
      await this.syncLinkedProfilePhoto(assetId, this.core.getPublicUrl(asset.publishedKey), 'approved');
      return { url: this.core.getPublicUrl(asset.publishedKey), key: asset.publishedKey };
    }
    if (asset.status === 'rejected') throw new BadRequestException('Отклонённый файл нельзя опубликовать');
    if (reviewerId && asset.status !== 'review_required') {
      throw new BadRequestException('Этот файл больше не ожидает решения модератора');
    }

    const extension = this.core.getExtension(asset.quarantineKey, asset.contentType);
    const destinationKey = `${asset.ownerId}/uploads/moderated/${asset.id}.${extension}`;
    await this.core.copyObjectBetweenBuckets(
      this.assertQuarantineConfigured(),
      asset.quarantineKey,
      this.core.settings.bucket,
      destinationKey,
    );
    await this.prisma.mediaModerationAsset.update({
      where: { id: asset.id },
      data: {
        status: 'approved',
        publishedKey: destinationKey,
        reviewedAt: reviewerId ? new Date() : asset.reviewedAt,
        reviewerId: reviewerId ?? asset.reviewerId,
        reviewNote: reviewNote?.trim() || asset.reviewNote,
      },
    });
    await this.syncLinkedActivityMedia(assetId, this.core.getPublicUrl(destinationKey), 'approved');
    await this.syncLinkedProfilePhoto(assetId, this.core.getPublicUrl(destinationKey), 'approved');
    await this.deleteQuarantineObject(asset.quarantineKey);
    return { url: this.core.getPublicUrl(destinationKey), key: destinationKey };
  }

  async publishApprovedModerationAsset(ownerId: string, assetId: string) {
    if (!this.prisma) throw new ServiceUnavailableException('Хранилище статусов загрузки недоступно');
    const asset = await this.prisma.mediaModerationAsset.findFirst({ where: { id: assetId, ownerId } });
    if (!asset) throw new BadRequestException('Загруженный файл не найден');
    if (asset.status !== 'approved') throw new BadRequestException('Модератор ещё не одобрил этот файл');
    return await this.approveModerationAsset(assetId);
  }

  async refreshLinkedActivityMedia(assetIds: Array<string | null | undefined>) {
    if (!this.prisma) return;
    const uniqueAssetIds = [...new Set(assetIds.filter((assetId): assetId is string => Boolean(assetId)))];
    for (const assetId of uniqueAssetIds) {
      const asset = await this.prisma.mediaModerationAsset.findUnique({
        where: { id: assetId },
        select: { status: true, role: true, publishedKey: true },
      });
      if (!asset) continue;
      if (asset.status === 'approved' && asset.publishedKey) {
        await this.syncLinkedActivityMedia(assetId, this.core.getPublicUrl(asset.publishedKey), 'approved');
        await this.syncLinkedProfilePhoto(assetId, this.core.getPublicUrl(asset.publishedKey), 'approved');
      } else if (asset.status === 'rejected') {
        await this.syncLinkedActivityMedia(assetId, null, 'rejected');
        await this.syncLinkedProfilePhoto(assetId, null, 'rejected');
      } else if (asset.role === 'media') {
        await this.prisma.activityMedia.updateMany({
          where: { mediaModerationAssetId: assetId },
          data: { mediaReviewStatus: asset.status },
        });
        if (asset.status === 'failed') await this.syncLinkedProfilePhoto(assetId, null, 'rejected');
      }
    }
  }

  async rejectModerationAsset(assetId: string, reviewerId: string, reviewNote?: string) {
    if (!this.prisma) throw new ServiceUnavailableException('Хранилище статусов загрузки недоступно');
    const asset = await this.prisma.mediaModerationAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new BadRequestException('Загруженный файл не найден');
    if (asset.status === 'rejected') return;
    if (asset.status !== 'review_required')
      throw new BadRequestException('Этот файл больше не ожидает решения модератора');
    const linkedMedia =
      asset.role === 'media'
        ? await this.prisma.activityMedia.findMany({
            where: { mediaModerationAssetId: asset.id },
            select: { thumbnailModerationAssetId: true },
          })
        : [];
    if (asset.status === 'approved' && asset.publishedKey) await this.core.deleteObjectByKey(asset.publishedKey);
    await this.deleteQuarantineObject(asset.quarantineKey);
    await this.prisma.mediaModerationAsset.update({
      where: { id: asset.id },
      data: {
        status: 'rejected',
        publishedKey: null,
        reviewerId,
        reviewedAt: new Date(),
        reviewNote: reviewNote?.trim() || null,
      },
    });
    await this.syncLinkedActivityMedia(asset.id, null, 'rejected');
    await this.syncLinkedProfilePhoto(asset.id, null, 'rejected');
    await this.deleteActivityModerationAssets(
      asset.ownerId,
      linkedMedia.map((media: { thumbnailModerationAssetId: string | null }) => media.thumbnailModerationAssetId),
    );
  }

  async syncLinkedActivityMedia(assetId: string, url: string | null, status: 'approved' | 'rejected') {
    if (!this.prisma) return;
    const asset = await this.prisma.mediaModerationAsset.findUnique({
      where: { id: assetId },
      select: { role: true },
    });
    if (asset?.role === 'thumbnail') {
      await this.prisma.activityMedia.updateMany({
        where: { thumbnailModerationAssetId: assetId },
        data: { thumbnail: status === 'approved' ? url : null },
      });
      return;
    }
    await this.prisma.activityMedia.updateMany({
      where: { mediaModerationAssetId: assetId },
      data: { url, mediaReviewStatus: status, ...(status === 'rejected' ? { thumbnail: null } : {}) },
    });
  }

  async syncLinkedProfilePhoto(assetId: string, url: string | null, status: 'approved' | 'rejected') {
    if (!this.prisma) return;
    const profile = await this.prisma.profile.findFirst({
      where: { profilePhotoPendingAssetId: assetId },
      select: { userId: true, profilePhotoPendingBlurhash: true },
    });
    if (!profile) return;
    await this.prisma.profile.updateMany({
      where: { userId: profile.userId, profilePhotoPendingAssetId: assetId },
      data: {
        ...(status === 'approved' && url
          ? { profilePhoto: url, profilePhotoBlurhash: profile.profilePhotoPendingBlurhash }
          : {}),
        profilePhotoPendingAssetId: null,
        profilePhotoPendingBlurhash: null,
        updatedAt: new Date(),
      },
    });
  }
}
