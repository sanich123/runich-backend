import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Inject,
  Logger,
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
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { normalizeImage } from 'src/common/images/image-processing';
import { MAX_DELETE_BATCH_SIZE, S3_REGION } from '../shared/const';
import { getFeedbackPhotoKey, getProfilePhotoKey, getUserUploadKey } from '../shared/storage-key';
import type { PhotoUploadOptions, StorageSettings } from '../shared/types';

@Injectable()
export class StorageCoreService {
  readonly logger = new Logger('StorageService');
  readonly settings: StorageSettings;
  readonly client: S3Client;

  constructor(@Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService) {
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
      // Timeweb S3 совместим с AWS API, но не требует дополнительных заголовков
      // контрольных сумм, которые новые версии AWS SDK добавляют к PutObject.
      // Добавляем их только для операций, которым контрольная сумма нужна явно.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
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

  assertConfigured() {
    if (!this.settings.endpoint || !this.settings.bucket || !this.settings.accessKey || !this.settings.secretKey) {
      throw new ServiceUnavailableException('S3-хранилище не настроено на сервере');
    }
    return this.settings.bucket;
  }

  async measureS3<T>(operation: string, action: () => Promise<T>) {
    const startedAt = performance.now();
    try {
      return await action();
    } finally {
      this.latencyMetrics?.observeExternal('s3', operation, performance.now() - startedAt);
    }
  }

  getExtension(originalName: string, mimetype: string) {
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

  getPhotoKey(userId: string, extension: string, options: PhotoUploadOptions) {
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

  async normalizeImage(input: string | Buffer) {
    try {
      return await normalizeImage(input);
    } catch (error) {
      this.logger.warn(`Не удалось обработать изображение: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('Не удалось обработать изображение');
    }
  }

  async copyObject(sourceKey: string, destinationKey: string) {
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

  async copyObjectBetweenBuckets(
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

  isQuarantinePreviewUrl(previewUrl: string) {
    if (!this.settings.endpoint || !this.settings.quarantineBucket) return false;

    try {
      const parsedUrl = new URL(previewUrl);
      const endpointUrl = new URL(this.settings.endpoint);
      if (parsedUrl.origin !== endpointUrl.origin) return false;

      const endpointPath = endpointUrl.pathname.replace(/\/+$/, '');
      const bucketPath = `${endpointPath}/${encodeURIComponent(this.settings.quarantineBucket)}`;
      const keyPathPrefix = `${bucketPath}/`;
      if (!parsedUrl.pathname.startsWith(keyPathPrefix)) return false;
      if (this.settings.quarantineBucket !== this.settings.bucket) return true;

      let key: string;
      try {
        key = decodeURIComponent(parsedUrl.pathname.slice(keyPathPrefix.length));
      } catch {
        return false;
      }
      return Boolean(this.settings.quarantinePrefix && key.startsWith(this.settings.quarantinePrefix));
    } catch {
      return false;
    }
  }

  getPromotablePhotoKey(userId: string, publicUrl: string) {
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

  isMissingObjectError(error: unknown) {
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
