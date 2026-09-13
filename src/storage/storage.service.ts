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
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { normalizeImage } from 'src/common/images/image-processing';
import type { ActivityPhotoVideoObject, LocationObject } from 'src/activity/activity.dto';
import { DEFAULT_S3_ENDPOINT, DEFAULT_S3_REGION, MAX_DELETE_BATCH_SIZE } from './const';
import { decodeActivityRoute, encodeActivityRoute, getActivityRouteKey } from './activity-route';
import {
  getActivityPhotoKey,
  getExtensionFromStorageKey,
  getMigrationArchiveKey,
  getProfilePhotoKey,
  getUserUploadKey,
} from './storage-key';
import type { ActivityRouteStorageMetadata, StorageFile, StorageSettings } from './type';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly settings: StorageSettings;
  private readonly client: S3Client;

  constructor(@Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService) {
    const endpoint = process.env.S3_ENDPOINT?.trim() || DEFAULT_S3_ENDPOINT;
    const region = process.env.S3_REGION?.trim() || DEFAULT_S3_REGION;
    const bucket = process.env.S3_BUCKET?.trim() || '';
    const accessKey = process.env.S3_ACCESS_KEY?.trim() || '';
    const secretKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || '';
    const publicUrl = (process.env.S3_PUBLIC_URL?.trim() || `${endpoint}/${bucket}`).replace(/\/$/, '');

    this.settings = { endpoint, region, bucket, accessKey, secretKey, publicUrl };
    this.client = new S3Client({
      endpoint,
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

  async uploadPhoto(userId: string, file: StorageFile) {
    let stream: ReturnType<typeof createReadStream> | undefined;
    try {
      this.assertConfigured();
      const input = file.path ?? file.buffer;
      if (!input) throw new BadRequestException('Не удалось прочитать загруженный файл');

      const normalizedImage = file.mimetype.startsWith('image/') ? await this.normalizeImage(input) : undefined;
      const extension = normalizedImage ? 'webp' : this.getExtension(file.originalname, file.mimetype);
      const key = getUserUploadKey(userId, extension);
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
    return await decodeActivityRoute(await this.readObject(key, 'S3 не вернул файл маршрута активности'));
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

  async promoteActivityPhotos(userId: string, activityId: string, photos: ActivityPhotoVideoObject[]) {
    const movedKeys: string[] = [];
    const movedBySourceKey = new Map<string, string>();

    const promoteUrl = async (publicUrl: string) => {
      const sourceKey = this.getPromotablePhotoKey(userId, publicUrl);
      if (!sourceKey) return publicUrl;

      const existingDestinationKey = movedBySourceKey.get(sourceKey);
      if (existingDestinationKey) return this.getPublicUrl(existingDestinationKey);

      const destinationKey = getActivityPhotoKey(userId, activityId, getExtensionFromStorageKey(sourceKey));
      await this.copyObject(sourceKey, destinationKey);
      movedKeys.push(destinationKey);
      await this.deleteObjectByKey(sourceKey);
      movedBySourceKey.set(sourceKey, destinationKey);
      return this.getPublicUrl(destinationKey);
    };

    try {
      const promotedPhotos: ActivityPhotoVideoObject[] = [];
      for (const photo of photos) {
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
    if (!this.settings.bucket || !this.settings.accessKey || !this.settings.secretKey) {
      throw new ServiceUnavailableException('S3-хранилище не настроено на сервере');
    }
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
    if (relativeKey.startsWith('profile/') || relativeKey.startsWith('activities/')) return undefined;
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
