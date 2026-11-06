import { Inject, Injectable, Optional } from '@nestjs/common';
import { StorageCoreService } from './storage-core.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageModerationService } from './storage-moderation.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { blurhashFromBuffer } from 'src/common/images/blurhash';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { isSupportedVideoUpload, MEDIA_BATCH_CONCURRENCY } from '../shared/const';
import { MEDIA_UPLOAD_ROLES } from '../shared/types';
import { MediaUploadManifestEntry, PhotoUploadOptions, StorageFile, UploadedPhotoBatch } from '../shared/types';

@Injectable()
export class StorageUploadService {
  constructor(
    @Inject(StorageCoreService) private readonly core: StorageCoreService,
    @Inject(StorageModerationService) private readonly moderation: StorageModerationService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  async uploadPhoto(
    userId: string,
    file: StorageFile,
    options: PhotoUploadOptions = {},
    manifestEntry?: MediaUploadManifestEntry,
  ) {
    let stream: ReturnType<typeof createReadStream> | undefined;
    try {
      this.core.assertConfigured();
      const isVideo = file.mimetype.startsWith('video/');
      const maximumFileSize = isVideo ? UPLOAD_LIMITS.videoBytes : UPLOAD_LIMITS.photoBytes;
      const fileSize = file.size ?? file.buffer?.byteLength ?? 0;
      if (fileSize > maximumFileSize) {
        throw new BadRequestException(
          isVideo ? 'Размер видео должен быть не более 50 МБ' : 'Размер изображения должен быть не более 15 МБ',
        );
      }
      const isUnsupportedVideo =
        file.mimetype.startsWith('video/') && !isSupportedVideoUpload(file.originalname, file.mimetype);
      if (isUnsupportedVideo) {
        throw new BadRequestException('Разрешены видео только в форматах MP4, MOV и WebM');
      }
      const input = file.path ?? file.buffer;
      if (!input) throw new BadRequestException('Не удалось прочитать загруженный файл');

      const normalizedImage = file.mimetype.startsWith('image/') ? await this.core.normalizeImage(input) : undefined;
      const blurhash = normalizedImage ? await blurhashFromBuffer(normalizedImage) : null;
      const extension = normalizedImage ? 'webp' : this.core.getExtension(file.originalname, file.mimetype);
      const mediaId = manifestEntry?.mediaId ?? randomUUID();
      const role = manifestEntry?.role ?? 'media';
      const scope = options.scope ?? 'activity';
      if (scope === 'group' && isVideo) throw new BadRequestException('Фото группы должно быть изображением');
      if (scope === 'group' && options.groupId) {
        const membership = await this.prisma?.groupMember.findUnique({
          where: { groupId_userId: { groupId: options.groupId, userId } },
          select: { role: true, status: true },
        });
        if (!membership || membership.status !== 'active' || !['owner', 'admin'].includes(membership.role)) {
          throw new ForbiddenException('Только администратор группы может загрузить её фото');
        }
      }
      if (scope !== 'feedback') {
        return await this.moderation.uploadForModeration({
          userId,
          mediaId,
          role,
          scope,
          extension,
          contentType: normalizedImage ? 'image/webp' : file.mimetype,
          contentLength: normalizedImage?.length ?? fileSize,
          body: normalizedImage ?? (file.path ? (stream = createReadStream(file.path)) : file.buffer!),
          blurhash,
        });
      }

      const key = this.core.getPhotoKey(userId, extension, options);
      const body = normalizedImage ?? (file.path ? (stream = createReadStream(file.path)) : file.buffer);
      const contentType = normalizedImage ? 'image/webp' : file.mimetype;
      const contentLength = normalizedImage?.length ?? file.size;

      await this.core.measureS3('putObject', () =>
        this.core.client.send(
          new PutObjectCommand({
            Bucket: this.core.settings.bucket,
            Key: key,
            Body: body,
            ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        ),
      );

      return { url: this.core.getPublicUrl(key), key, contentType };
    } finally {
      stream?.destroy();
      if (file.path) {
        try {
          await rm(file.path, { force: true });
        } catch (error) {
          this.core.logger.warn(
            `Не удалось удалить временный файл загрузки: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  async uploadPhotos(
    userId: string,
    files: StorageFile[],
    options: PhotoUploadOptions = {},
    rawManifest = '',
  ): Promise<UploadedPhotoBatch[]> {
    if (!files.length) throw new BadRequestException('Не указаны файлы: files');
    if (files.length > UPLOAD_LIMITS.mediaBatchFiles) {
      throw new BadRequestException(`Можно загрузить не более ${UPLOAD_LIMITS.mediaBatchFiles} файлов за раз`);
    }
    const totalBytes = files.reduce((total, file) => total + (file.size ?? file.buffer?.byteLength ?? 0), 0);
    if (totalBytes > UPLOAD_LIMITS.mediaBatchBytes) {
      throw new BadRequestException('Суммарный размер файлов не должен превышать 250 МБ');
    }

    const manifest = this.parseUploadManifest(rawManifest, files.length);
    const results: Array<UploadedPhotoBatch | undefined> = Array.from({ length: files.length });
    const errors: unknown[] = [];
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < files.length) {
        const index = nextIndex++;
        try {
          results[index] = {
            ...(await this.uploadPhoto(userId, files[index], options, manifest[index])),
            ...manifest[index],
          };
        } catch (error) {
          errors.push(error);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(MEDIA_BATCH_CONCURRENCY, files.length) }, () => worker()));

    if (errors.length) {
      await Promise.allSettled(
        results
          .filter((result): result is UploadedPhotoBatch => Boolean(result))
          .map(async (result) => {
            if (result.key) await this.core.deleteObjectByKey(result.key);
            if (result.assetId) await this.moderation.deleteQuarantineAsset(result.assetId, userId);
          }),
      );
      throw errors[0];
    }

    return results as UploadedPhotoBatch[];
  }

  parseUploadManifest(rawManifest: string, fileCount: number): MediaUploadManifestEntry[] {
    let manifest: unknown;
    try {
      manifest = JSON.parse(rawManifest);
    } catch {
      throw new BadRequestException('Некорректный manifest медиафайлов');
    }

    if (!Array.isArray(manifest) || manifest.length !== fileCount) {
      throw new BadRequestException('Manifest медиафайлов не совпадает с количеством файлов');
    }

    const seen = new Set<string>();
    return manifest.map((entry) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof (entry as { mediaId?: unknown }).mediaId !== 'string' ||
        !(MEDIA_UPLOAD_ROLES as readonly unknown[]).includes((entry as { role?: unknown }).role)
      ) {
        throw new BadRequestException('Некорректная запись manifest медиафайлов');
      }

      const mediaId = (entry as { mediaId: string }).mediaId.trim();
      const role = (entry as { role: MediaUploadManifestEntry['role'] }).role;
      const key = `${mediaId}:${role}`;
      if (!mediaId || mediaId.length > 100 || seen.has(key)) {
        throw new BadRequestException('Manifest содержит пустой, слишком длинный или дублирующий mediaId и role');
      }
      seen.add(key);
      return { mediaId, role };
    });
  }
}
