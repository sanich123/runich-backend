import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { normalizeImage } from 'src/common/images/image-processing';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { ActivityHeartRateSampleObject, ActivityMediaObject, LocationObject } from 'src/activity/activity.dto';
import {
  ACTIVITY_ROUTE_CACHE_MAX_ENTRIES,
  ACTIVITY_ROUTE_CACHE_TTL_MS,
  S3_REGION,
  isSupportedVideoUpload,
  MAX_DELETE_BATCH_SIZE,
  MEDIA_BATCH_CONCURRENCY,
} from './const';
import { decodeActivityRoute, encodeActivityRoute, getActivityRouteKey } from './activity-route';
import { decodeActivityHeartRateSamples, encodeActivityHeartRateSamples } from './activity-heart-rate';
import {
  getActivityPhotoKey,
  getExtensionFromStorageKey,
  getFeedbackPhotoKey,
  getMigrationArchiveKey,
  getProfilePhotoKey,
  getUserUploadKey,
} from './storage-key';
import { MEDIA_UPLOAD_ROLES } from './type';
import type {
  ActivityRouteStorageMetadata,
  MediaUploadManifestEntry,
  PhotoUploadOptions,
  StorageFile,
  StorageSettings,
  UploadedPhotoBatch,
  ActivityRouteCacheEntry,
} from './type';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly settings: StorageSettings;
  private readonly client: S3Client;
  private readonly activityRouteCache = new Map<string, ActivityRouteCacheEntry>();

  constructor(
    @Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {
    const endpoint = process.env.S3_ENDPOINT?.trim() || '';
    const region = S3_REGION;
    const bucket = process.env.S3_BUCKET?.trim() || '';
    const quarantineBucket = process.env.S3_QUARANTINE_BUCKET?.trim() || '';
    const rawQuarantinePrefix = process.env.S3_QUARANTINE_PREFIX?.trim().replace(/^\/+|\/+$/g, '') || '';
    const quarantinePrefix = rawQuarantinePrefix ? `${rawQuarantinePrefix}/` : '';
    if (
      rawQuarantinePrefix &&
      rawQuarantinePrefix.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      throw new Error('S3_QUARANTINE_PREFIX contains an invalid path segment');
    }
    const accessKey = process.env.S3_ACCESS_KEY?.trim() || '';
    const secretKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || '';
    const configuredPublicUrl = process.env.S3_PUBLIC_URL?.trim();
    const publicUrl = (configuredPublicUrl || (endpoint && bucket ? `${endpoint}/${bucket}` : '')).replace(/\/$/, '');

    this.settings = { endpoint, region, bucket, quarantineBucket, quarantinePrefix, accessKey, secretKey, publicUrl };
    this.client = new S3Client({
      endpoint: endpoint || undefined,
      region,
      forcePathStyle: true,
      // Timeweb S3 is compatible with the AWS API, but its object storage does
      // not require the optional flexible checksum headers that newer AWS SDK
      // versions add to PutObject requests. Avoid signing those headers unless
      // an operation explicitly requires a checksum.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: accessKey && secretKey ? { accessKeyId: accessKey, secretAccessKey: secretKey } : undefined,
    });
  }

  async uploadPhoto(
    userId: string,
    file: StorageFile,
    options: PhotoUploadOptions = {},
    manifestEntry?: MediaUploadManifestEntry,
  ) {
    let stream: ReturnType<typeof createReadStream> | undefined;
    try {
      this.assertConfigured();
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

      const normalizedImage = file.mimetype.startsWith('image/') ? await this.normalizeImage(input) : undefined;
      const extension = normalizedImage ? 'webp' : this.getExtension(file.originalname, file.mimetype);
      const mediaId = manifestEntry?.mediaId ?? randomUUID();
      const role = manifestEntry?.role ?? 'media';
      const scope = options.scope ?? 'activity';
      if (scope !== 'feedback') {
        return await this.uploadForModeration({
          userId,
          mediaId,
          role,
          scope,
          extension,
          contentType: normalizedImage ? 'image/webp' : file.mimetype,
          contentLength: normalizedImage?.length ?? fileSize,
          body: normalizedImage ?? (file.path ? (stream = createReadStream(file.path)) : file.buffer!),
        });
      }

      const key = this.getPhotoKey(userId, extension, options);
      const body = normalizedImage ?? (file.path ? (stream = createReadStream(file.path)) : file.buffer);
      const contentType = normalizedImage ? 'image/webp' : file.mimetype;
      const contentLength = normalizedImage?.length ?? file.size;

      await this.measureS3('putObject', () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.settings.bucket,
            Key: key,
            Body: body,
            ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        ),
      );

      return { url: this.getPublicUrl(key), key, contentType };
    } finally {
      stream?.destroy();
      if (file.path) {
        try {
          await rm(file.path, { force: true });
        } catch (error) {
          this.logger.warn(
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
            if (result.key) await this.deleteObjectByKey(result.key);
            if (result.assetId) await this.deleteQuarantineAsset(result.assetId, userId);
          }),
      );
      throw errors[0];
    }

    return results as UploadedPhotoBatch[];
  }

  private async uploadForModeration(input: {
    userId: string;
    mediaId: string;
    role: MediaUploadManifestEntry['role'];
    scope: Exclude<NonNullable<PhotoUploadOptions['scope']>, 'feedback'>;
    extension: string;
    contentType: string;
    contentLength: number;
    body: Buffer | Uint8Array | Readable;
  }) {
    if (!this.prisma) throw new ServiceUnavailableException('Проверка загружаемых медиафайлов не настроена');
    const publicBucket = this.assertConfigured();
    const quarantineBucket = this.assertQuarantineConfigured();
    if (publicBucket === quarantineBucket && !this.settings.quarantinePrefix) {
      throw new ServiceUnavailableException('Для карантина в основном S3-бакете задайте S3_QUARANTINE_PREFIX');
    }

    const assetId = randomUUID();
    const quarantineKey = `${this.settings.quarantinePrefix}${input.userId}/${assetId}.${input.extension}`;
    await this.measureS3('putQuarantineObject', () =>
      this.client.send(
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
          byteSize: input.contentLength,
        },
        select: { id: true, status: true, contentType: true },
      });
      return { assetId: asset.id, status: asset.status, contentType: asset.contentType };
    } catch (error) {
      await this.deleteQuarantineObject(quarantineKey).catch(() => undefined);
      throw error;
    }
  }

  private async deleteQuarantineAsset(assetId: string, ownerId: string) {
    if (!this.prisma) return;
    const asset = await this.prisma.mediaModerationAsset.findFirst({ where: { id: assetId, ownerId } });
    if (!asset) return;
    await this.deleteQuarantineObject(asset.quarantineKey);
    if (asset.publishedKey) await this.deleteObjectByKey(asset.publishedKey);
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
    if (asset.publishedKey) await this.deleteObjectByKey(asset.publishedKey);
    await this.prisma.mediaModerationAsset.delete({ where: { id: assetId } });
  }

  async deleteActivityModerationAssets(ownerId: string, assetIds: Array<string | null | undefined>) {
    const uniqueAssetIds = [...new Set(assetIds.filter((assetId): assetId is string => Boolean(assetId)))];
    for (const assetId of uniqueAssetIds) {
      await this.deleteQuarantineAsset(assetId, ownerId);
    }
  }

  private async deleteQuarantineObject(key: string) {
    const bucket = this.assertQuarantineConfigured();
    await this.measureS3('deleteQuarantineObject', () =>
      this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
    );
  }

  private assertQuarantineConfigured() {
    if (!this.settings.quarantineBucket || !this.settings.accessKey || !this.settings.secretKey) {
      throw new ServiceUnavailableException('Карантинное S3-хранилище не настроено');
    }
    if (this.settings.bucket === this.settings.quarantineBucket && !this.settings.quarantinePrefix) {
      throw new ServiceUnavailableException('Для карантина в основном S3-бакете задайте S3_QUARANTINE_PREFIX');
    }
    return this.settings.quarantineBucket;
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
        ...(asset.status === 'approved' && asset.publishedKey ? { url: this.getPublicUrl(asset.publishedKey) } : {}),
        contentType: asset.contentType,
      })),
    };
  }

  async downloadQuarantineObjectToFile(key: string, filePath: string) {
    const bucket = this.assertQuarantineConfigured();
    await mkdir(dirname(filePath), { recursive: true });
    const response = await this.measureS3('getQuarantineObject', () =>
      this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key })),
    );
    if (!response.Body) throw new Error(`S3 не вернул карантинный объект ${key}`);
    await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(filePath));
  }

  async getQuarantinePreviewUrl(key: string) {
    const bucket = this.assertQuarantineConfigured();
    return await getSignedUrl(this.client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 600 });
  }

  async approveModerationAsset(assetId: string, reviewerId?: string, reviewNote?: string) {
    if (!this.prisma) throw new ServiceUnavailableException('Хранилище статусов загрузки недоступно');
    const asset = await this.prisma.mediaModerationAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new BadRequestException('Загруженный файл не найден');
    if (asset.status === 'approved' && asset.publishedKey) {
      await this.syncLinkedActivityMedia(assetId, this.getPublicUrl(asset.publishedKey), 'approved');
      return { url: this.getPublicUrl(asset.publishedKey), key: asset.publishedKey };
    }
    if (asset.status === 'rejected') throw new BadRequestException('Отклонённый файл нельзя опубликовать');
    if (reviewerId && asset.status !== 'review_required') {
      throw new BadRequestException('Этот файл больше не ожидает решения модератора');
    }

    const extension = this.getExtension(asset.quarantineKey, asset.contentType);
    const destinationKey = `${asset.ownerId}/uploads/moderated/${asset.id}.${extension}`;
    await this.copyObjectBetweenBuckets(
      this.assertQuarantineConfigured(),
      asset.quarantineKey,
      this.settings.bucket,
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
    await this.syncLinkedActivityMedia(assetId, this.getPublicUrl(destinationKey), 'approved');
    await this.deleteQuarantineObject(asset.quarantineKey);
    return { url: this.getPublicUrl(destinationKey), key: destinationKey };
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
        await this.syncLinkedActivityMedia(assetId, this.getPublicUrl(asset.publishedKey), 'approved');
      } else if (asset.status === 'rejected') {
        await this.syncLinkedActivityMedia(assetId, null, 'rejected');
      } else if (asset.role === 'media') {
        await this.prisma.activityMedia.updateMany({
          where: { mediaModerationAssetId: assetId },
          data: { mediaReviewStatus: asset.status },
        });
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
    if (asset.status === 'approved' && asset.publishedKey) await this.deleteObjectByKey(asset.publishedKey);
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
    await this.deleteActivityModerationAssets(
      asset.ownerId,
      linkedMedia.map((media: { thumbnailModerationAssetId: string | null }) => media.thumbnailModerationAssetId),
    );
  }

  private async syncLinkedActivityMedia(assetId: string, url: string | null, status: 'approved' | 'rejected') {
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

  async uploadMigrationArchive(userId: string, migrationId: string, filePath: string) {
    let stream: ReturnType<typeof createReadStream> | undefined;
    try {
      this.assertConfigured();
      const { size } = await stat(filePath);
      const key = getMigrationArchiveKey(userId, migrationId);
      stream = createReadStream(filePath);

      await this.measureS3('putObject', () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.settings.bucket,
            Key: key,
            Body: stream,
            ContentLength: size,
            ContentType: 'application/zip',
            CacheControl: 'private, no-store',
          }),
        ),
      );

      return { key, url: this.getPublicUrl(key) };
    } finally {
      stream?.destroy();
      await rm(filePath, { force: true });
    }
  }

  private parseUploadManifest(rawManifest: string, fileCount: number): MediaUploadManifestEntry[] {
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

  async uploadActivityRoute(userId: string, activityId: string, locations: LocationObject[]) {
    this.assertConfigured();
    const { body, metadata } = await encodeActivityRoute(locations);
    const key = getActivityRouteKey(userId, activityId);

    await this.measureS3('putObject', () =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
          Body: body,
          ContentLength: body.byteLength,
          ContentType: 'application/json',
          ContentEncoding: 'gzip',
          CacheControl: 'private, no-store',
        }),
      ),
    );

    return { key, ...metadata } satisfies ActivityRouteStorageMetadata;
  }

  async readActivityRoute(key: string) {
    return await decodeActivityRoute(await this.readCachedActivityRouteBody(key));
  }

  async uploadActivityHeartRateSamples(userId: string, activityId: string, samples: ActivityHeartRateSampleObject[]) {
    this.assertConfigured();
    const { body, key } = await encodeActivityHeartRateSamples(userId, activityId, samples);

    await this.measureS3('putObject', () =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.settings.bucket,
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
    return await decodeActivityHeartRateSamples(await this.readObject(key, 'S3 не вернул данные пульса активности'));
  }

  private async readCachedActivityRouteBody(key: string) {
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

    const pending = this.readObject(key, 'S3 не вернул файл маршрута активности');
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

  async readJson<T>(key: string): Promise<T> {
    return JSON.parse(Buffer.from(await this.readObject(key)).toString('utf8')) as T;
  }

  async readObject(key: string, missingObjectMessage = `S3 не вернул объект ${key}`) {
    this.assertConfigured();
    const response = await this.measureS3('getObject', () =>
      this.client.send(
        new GetObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
        }),
      ),
    );
    if (!response.Body) throw new Error(missingObjectMessage);
    return await response.Body.transformToByteArray();
  }

  async downloadObjectToFile(key: string, filePath: string, missingObjectMessage = `S3 не вернул объект ${key}`) {
    this.assertConfigured();
    await mkdir(dirname(filePath), { recursive: true });

    try {
      const response = await this.measureS3('getObject', () =>
        this.client.send(
          new GetObjectCommand({
            Bucket: this.settings.bucket,
            Key: key,
          }),
        ),
      );
      if (!response.Body) throw new Error(missingObjectMessage);
      await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(filePath));
    } catch (error) {
      if (this.isMissingObjectError(error)) throw new Error(missingObjectMessage, { cause: error });
      throw error;
    }
  }

  async uploadObject(key: string, body: Buffer | Uint8Array, contentType: string, cacheControl?: string) {
    this.assertConfigured();
    await this.measureS3('putObject', () =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
          Body: body,
          ContentLength: body.byteLength,
          ContentType: contentType,
          ...(cacheControl ? { CacheControl: cacheControl } : {}),
        }),
      ),
    );
    return { key, url: this.getPublicUrl(key) };
  }

  async promoteProfilePhoto(userId: string, publicUrl: string) {
    const sourceKey = this.getPromotablePhotoKey(userId, publicUrl);
    if (!sourceKey) return publicUrl;

    const destinationKey = getProfilePhotoKey(userId, getExtensionFromStorageKey(sourceKey));
    await this.copyObject(sourceKey, destinationKey);
    await this.deleteObjectByKey(sourceKey);
    return this.getPublicUrl(destinationKey);
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
      const sourceKey = this.getPromotablePhotoKey(userId, publicUrl);
      if (!sourceKey) return publicUrl;

      const existingDestinationKey = movedBySourceKey.get(sourceKey);
      if (existingDestinationKey) return this.getPublicUrl(existingDestinationKey);

      const destinationKey = getActivityPhotoKey(userId, activityId, getExtensionFromStorageKey(sourceKey), createdAt);
      await this.copyObject(sourceKey, destinationKey);
      movedKeys.push(destinationKey);
      await this.deleteObjectByKey(sourceKey);
      movedBySourceKey.set(sourceKey, destinationKey);
      return this.getPublicUrl(destinationKey);
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
              ? { url: this.getPublicUrl(mediaAsset.publishedKey) }
              : {}),
            ...(thumbnailAsset?.status === 'approved' && thumbnailAsset.publishedKey
              ? { thumbnail: this.getPublicUrl(thumbnailAsset.publishedKey) }
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
      await Promise.allSettled(movedKeys.map((key) => this.deleteObjectByKey(key)));
      throw error;
    }
  }

  async deleteObjectByKey(key: string) {
    this.assertConfigured();
    await this.measureS3('deleteObject', () =>
      this.client.send(
        new DeleteObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
        }),
      ),
    );
  }

  async deletePhoto(userId: string, publicUrl: string) {
    await this.deleteObjectByKey(this.getOwnedKey(userId, publicUrl));
  }

  async deleteUserFiles(userId: string) {
    this.assertConfigured();
    const prefix = `${userId}/`;
    let continuationToken: string | undefined;
    let deleted = 0;

    do {
      const page = await this.measureS3('listObjects', () =>
        this.client.send(
          new ListObjectsV2Command({
            Bucket: this.settings.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        ),
      );
      const keys = (page.Contents ?? []).map(({ Key }) => Key).filter((key): key is string => Boolean(key));

      for (let offset = 0; offset < keys.length; offset += MAX_DELETE_BATCH_SIZE) {
        const batch = keys.slice(offset, offset + MAX_DELETE_BATCH_SIZE);
        const result = await this.measureS3('deleteObjects', () =>
          this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.settings.bucket,
              Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
            }),
          ),
        );
        if (result.Errors?.length) {
          throw new Error(`S3 не удалил ${result.Errors.length} объектов пользователя`);
        }
        deleted += batch.length;
      }

      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    this.logger.log(`Удалены S3-файлы пользователя ${userId}: ${deleted}`);
    return { deleted };
  }

  getPublicUrl(key: string) {
    if (!this.settings.endpoint) {
      throw new ServiceUnavailableException('S3_ENDPOINT не задан в конфигурации сервера');
    }
    return `${this.settings.publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  getOwnedKey(userId: string, publicUrl: string) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(publicUrl);
    } catch {
      throw new BadRequestException('Некорректная ссылка на фото');
    }

    const publicBaseUrl = [this.settings.publicUrl, `${this.settings.endpoint}/${this.settings.bucket}`]
      .map((value) => {
        try {
          return new URL(value);
        } catch {
          return undefined;
        }
      })
      .find((baseUrl) => {
        if (!baseUrl || parsedUrl.origin !== baseUrl.origin) return false;
        const basePath = baseUrl.pathname.replace(/\/$/, '');
        return parsedUrl.pathname.startsWith(`${basePath}/`);
      });

    if (!publicBaseUrl) {
      throw new BadRequestException('Ссылка на фото не принадлежит S3-хранилищу Runich');
    }

    const basePath = publicBaseUrl.pathname.replace(/\/$/, '');
    let key: string;
    try {
      key = decodeURIComponent(parsedUrl.pathname.slice(basePath.length + 1));
    } catch {
      throw new BadRequestException('Некорректный путь к фото');
    }

    if (!key || key.includes('\0') || key.split('/')[0] !== userId) {
      throw new ForbiddenException('Недостаточно прав для удаления этого фото');
    }

    return key;
  }

  private assertConfigured() {
    if (!this.settings.endpoint || !this.settings.bucket || !this.settings.accessKey || !this.settings.secretKey) {
      throw new ServiceUnavailableException('S3-хранилище не настроено на сервере');
    }
    return this.settings.bucket;
  }

  private async measureS3<T>(operation: string, action: () => Promise<T>) {
    const startedAt = performance.now();
    try {
      return await action();
    } finally {
      this.latencyMetrics?.observeExternal('s3', operation, performance.now() - startedAt);
    }
  }

  private getExtension(originalName: string, mimetype: string) {
    const extension = extname(originalName)
      .slice(1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (extension) return extension;

    const fallback = mimetype
      .split('/')[1]
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return fallback || 'bin';
  }

  private getPhotoKey(userId: string, extension: string, options: PhotoUploadOptions) {
    switch (options.scope) {
      case 'profile':
        return getProfilePhotoKey(userId, extension);
      case 'feedback':
        if (!options.feedbackId) throw new BadRequestException('Для feedback-загрузки нужен feedbackId');
        return getFeedbackPhotoKey(userId, options.feedbackId, extension);
      case 'activity':
      default:
        return getUserUploadKey(userId, extension);
    }
  }

  private async normalizeImage(input: string | Buffer) {
    try {
      return await normalizeImage(input);
    } catch (error) {
      this.logger.warn(`Не удалось обработать изображение: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('Не удалось обработать изображение');
    }
  }

  private async copyObject(sourceKey: string, destinationKey: string) {
    this.assertConfigured();
    await this.measureS3('copyObject', () =>
      this.client.send(
        new CopyObjectCommand({
          Bucket: this.settings.bucket,
          Key: destinationKey,
          CopySource: `${this.settings.bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
          CacheControl: 'public, max-age=31536000, immutable',
          MetadataDirective: 'COPY',
        }),
      ),
    );
  }

  private async copyObjectBetweenBuckets(
    sourceBucket: string,
    sourceKey: string,
    destinationBucket: string,
    destinationKey: string,
  ) {
    this.assertConfigured();
    await this.measureS3('copyQuarantineObject', () =>
      this.client.send(
        new CopyObjectCommand({
          Bucket: destinationBucket,
          Key: destinationKey,
          CopySource: `${sourceBucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
          CacheControl: 'public, max-age=31536000, immutable',
          MetadataDirective: 'COPY',
        }),
      ),
    );
  }

  private getPromotablePhotoKey(userId: string, publicUrl: string) {
    let key: string;
    try {
      key = this.getOwnedKey(userId, publicUrl);
    } catch {
      return undefined;
    }

    const userPrefix = `${userId}/`;
    if (!key.startsWith(userPrefix)) return undefined;
    const relativeKey = key.slice(userPrefix.length);
    if (
      relativeKey.startsWith('profile/') ||
      relativeKey.startsWith('activities/') ||
      relativeKey.startsWith('feedback/')
    )
      return undefined;
    if (!relativeKey.startsWith('uploads/') && relativeKey.includes('/')) return undefined;
    return key;
  }

  private isMissingObjectError(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
    return (
      candidate.$metadata?.httpStatusCode === 404 ||
      candidate.name === 'NoSuchKey' ||
      candidate.name === 'NotFound' ||
      candidate.name === 'NoSuchObject'
    );
  }
}
