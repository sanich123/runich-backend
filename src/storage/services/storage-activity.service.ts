import { Inject, Injectable, Optional } from '@nestjs/common';
import { StorageCoreService } from './storage-core.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { ActivityHeartRateSampleObject, ActivityMediaObject, LocationObject } from 'src/activity/dto/activity.dto';
import { ACTIVITY_ROUTE_CACHE_MAX_ENTRIES, ACTIVITY_ROUTE_CACHE_TTL_MS } from '../shared/const';
import { decodeActivityRoute, encodeActivityRoute, getActivityRouteKey } from '../shared/activity-route';
import { decodeActivityHeartRateSamples, encodeActivityHeartRateSamples } from '../shared/activity-heart-rate';
import { getActivityPhotoKey, getExtensionFromStorageKey, getMigrationArchiveKey } from '../shared/storage-key';
import type { ActivityRouteCacheEntry, ActivityRouteStorageMetadata } from '../shared/types';

@Injectable()
export class StorageActivityService {
  private readonly activityRouteCache = new Map<string, ActivityRouteCacheEntry>();

  constructor(
    private readonly core: StorageCoreService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  async uploadMigrationArchive(userId: string, migrationId: string, filePath: string) {
    let stream: ReturnType<typeof createReadStream> | undefined;
    try {
      this.core.assertConfigured();
      const { size } = await stat(filePath);
      const key = getMigrationArchiveKey(userId, migrationId);
      stream = createReadStream(filePath);

      await this.core.measureS3('putObject', () =>
        this.core.client.send(
          new PutObjectCommand({
            Bucket: this.core.settings.bucket,
            Key: key,
            Body: stream,
            ContentLength: size,
            ContentType: 'application/zip',
            CacheControl: 'private, no-store',
          }),
        ),
      );

      return { key, url: this.core.getPublicUrl(key) };
    } finally {
      stream?.destroy();
      await rm(filePath, { force: true });
    }
  }

  async uploadActivityRoute(userId: string, activityId: string, locations: LocationObject[]) {
    this.core.assertConfigured();
    const { body, metadata } = await encodeActivityRoute(locations);
    const key = getActivityRouteKey(userId, activityId);

    await this.core.measureS3('putObject', () =>
      this.core.client.send(
        new PutObjectCommand({
          Bucket: this.core.settings.bucket,
          Key: key,
          Body: body,
          ContentLength: body.byteLength,
          ContentType: 'application/json',
          ContentEncoding: 'gzip',
          CacheControl: 'private, no-store',
        }),
      ),
    );

    this.activityRouteCache.delete(key);
    return { key, ...metadata } satisfies ActivityRouteStorageMetadata;
  }

  async readActivityRoute(key: string) {
    return await decodeActivityRoute(await this.readCachedActivityRouteBody(key));
  }

  async uploadActivityHeartRateSamples(userId: string, activityId: string, samples: ActivityHeartRateSampleObject[]) {
    this.core.assertConfigured();
    const { body, key } = await encodeActivityHeartRateSamples(userId, activityId, samples);

    await this.core.measureS3('putObject', () =>
      this.core.client.send(
        new PutObjectCommand({
          Bucket: this.core.settings.bucket,
          Key: key,
          Body: body,
          ContentLength: body.byteLength,
          ContentType: 'application/json',
          ContentEncoding: 'gzip',
          CacheControl: 'private, no-store',
        }),
      ),
    );

    return key;
  }

  async readActivityHeartRateSamples(key: string) {
    return await decodeActivityHeartRateSamples(
      await this.core.readObject(key, 'S3 не вернул данные пульса активности'),
    );
  }

  async readCachedActivityRouteBody(key: string) {
    const now = Date.now();
    const cached = this.activityRouteCache.get(key);
    if (cached && cached.expiresAt > now) {
      // Map insertion order is used as a small LRU: recently read routes stay
      // available while old route bodies are evicted at the size limit.
      this.activityRouteCache.delete(key);
      this.activityRouteCache.set(key, cached);
      return cached.body ?? cached.pending!;
    }
    if (cached) this.activityRouteCache.delete(key);

    const pending = this.core.readObject(key, 'S3 не вернул файл маршрута активности');
    this.activityRouteCache.set(key, { pending, expiresAt: now + ACTIVITY_ROUTE_CACHE_TTL_MS });

    try {
      const body = await pending;
      this.activityRouteCache.set(key, { body, expiresAt: Date.now() + ACTIVITY_ROUTE_CACHE_TTL_MS });
      while (this.activityRouteCache.size > ACTIVITY_ROUTE_CACHE_MAX_ENTRIES) {
        const oldestKey = this.activityRouteCache.keys().next().value;
        if (typeof oldestKey !== 'string') break;
        this.activityRouteCache.delete(oldestKey);
      }
      return body;
    } catch (error) {
      const current = this.activityRouteCache.get(key);
      if (current?.pending === pending) this.activityRouteCache.delete(key);
      throw error;
    }
  }

  async promoteActivityPhotos(
    userId: string,
    activityId: string,
    photos: ActivityMediaObject[],
    createdAt = new Date(),
  ) {
    const movedKeys: string[] = [];
    const movedBySourceKey = new Map<string, string>();

    const promoteUrl = async (publicUrl: string) => {
      const sourceKey = this.core.getPromotablePhotoKey(userId, publicUrl);
      if (!sourceKey) return publicUrl;

      const existingDestinationKey = movedBySourceKey.get(sourceKey);
      if (existingDestinationKey) return this.core.getPublicUrl(existingDestinationKey);

      const destinationKey = getActivityPhotoKey(userId, activityId, getExtensionFromStorageKey(sourceKey), createdAt);
      await this.core.copyObject(sourceKey, destinationKey);
      movedKeys.push(destinationKey);
      await this.core.deleteObjectByKey(sourceKey);
      movedBySourceKey.set(sourceKey, destinationKey);
      return this.core.getPublicUrl(destinationKey);
    };

    try {
      const promotedPhotos: ActivityMediaObject[] = [];
      for (const photo of photos) {
        if (photo.assetId) {
          if (photo.url) throw new BadRequestException('Для проверяемого файла нельзя передавать публичный URL');
          const mediaAsset = await this.prisma?.mediaModerationAsset.findFirst({
            where: { id: photo.assetId, ownerId: userId, scope: 'activity', role: 'media' },
            select: { id: true, mediaId: true, status: true, publishedKey: true },
          });
          if (!mediaAsset)
            throw new BadRequestException('Загруженное медиа не найдено или принадлежит другому аккаунту');

          const thumbnailAsset = photo.thumbnailAssetId
            ? await this.prisma?.mediaModerationAsset.findFirst({
                where: {
                  id: photo.thumbnailAssetId,
                  ownerId: userId,
                  scope: 'activity',
                  role: 'thumbnail',
                  mediaId: mediaAsset.mediaId,
                },
                select: { id: true, status: true, publishedKey: true },
              })
            : null;
          if (photo.thumbnailAssetId && !thumbnailAsset) {
            throw new BadRequestException('Миниатюра не соответствует загруженному видео');
          }
          if (mediaAsset.status === 'failed') throw new BadRequestException('Не удалось проверить загруженный файл');

          promotedPhotos.push({
            assetId: mediaAsset.id,
            ...(mediaAsset.status === 'approved' && mediaAsset.publishedKey
              ? { url: this.core.getPublicUrl(mediaAsset.publishedKey) }
              : {}),
            ...(thumbnailAsset?.status === 'approved' && thumbnailAsset.publishedKey
              ? { thumbnail: this.core.getPublicUrl(thumbnailAsset.publishedKey) }
              : { thumbnail: null }),
            ...(thumbnailAsset ? { thumbnailAssetId: thumbnailAsset.id } : {}),
            mediaReviewStatus: mediaAsset.status as ActivityMediaObject['mediaReviewStatus'],
            blurhash: photo.blurhash ?? null,
          });
          continue;
        }
        if (!photo.url) throw new BadRequestException('Для медиафайла укажите URL или идентификатор загрузки');
        promotedPhotos.push({
          ...photo,
          url: await promoteUrl(photo.url),
          thumbnail: photo.thumbnail ? await promoteUrl(photo.thumbnail) : null,
        });
      }
      return { photos: promotedPhotos, keys: movedKeys };
    } catch (error) {
      await Promise.allSettled(movedKeys.map((key) => this.core.deleteObjectByKey(key)));
      throw error;
    }
  }
}
