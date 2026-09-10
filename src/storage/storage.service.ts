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
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import type { LocationObject } from 'src/activity/activity.dto';
import { DEFAULT_S3_ENDPOINT, DEFAULT_S3_REGION, MAX_DELETE_BATCH_SIZE } from './const';
import { decodeActivityRoute, encodeActivityRoute, getActivityRouteKey } from './activity-route';
import type { ActivityRouteStorageMetadata, StorageFile, StorageSettings } from './type';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly settings: StorageSettings;
  private readonly client: S3Client;

  constructor(@Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService) {
    const endpoint = DEFAULT_S3_ENDPOINT;
    const region = DEFAULT_S3_REGION;
    const bucket = process.env.S3_BUCKET ?? '';
    const accessKey = process.env.S3_ACCESS_KEY ?? process.env.S3_ACCESS_KEY_ID ?? '';
    const secretKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_KEY ?? '';
    const publicUrl = (process.env.S3_PUBLIC_URL ?? `${endpoint}/${bucket}`).replace(/\/$/, '');

    this.settings = { endpoint, region, bucket, accessKey, secretKey, publicUrl };
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: accessKey && secretKey ? { accessKeyId: accessKey, secretAccessKey: secretKey } : undefined,
    });
  }

  async uploadPhoto(userId: string, file: StorageFile) {
    let stream: ReturnType<typeof createReadStream> | undefined;
    try {
      this.assertConfigured();
      const extension = this.getExtension(file.originalname, file.mimetype);
      const key = `${userId}/${randomUUID()}.${extension}`;
      const body = file.path ? (stream = createReadStream(file.path)) : file.buffer;

      if (!body) throw new BadRequestException('Не удалось прочитать загруженный файл');

      await this.measureS3('putObject', () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.settings.bucket,
            Key: key,
            Body: body,
            ...(file.size === undefined ? {} : { ContentLength: file.size }),
            ContentType: file.mimetype,
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        ),
      );

      return { url: this.getPublicUrl(key), key, contentType: file.mimetype };
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
    this.assertConfigured();
    const response = await this.measureS3('getObject', () =>
      this.client.send(
        new GetObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
        }),
      ),
    );
    if (!response.Body) throw new Error('S3 не вернул файл маршрута активности');

    return await decodeActivityRoute(await response.Body.transformToByteArray());
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
    let publicBaseUrl: URL;
    try {
      parsedUrl = new URL(publicUrl);
      publicBaseUrl = new URL(this.settings.publicUrl);
    } catch {
      throw new BadRequestException('Некорректная ссылка на фото');
    }

    const basePath = publicBaseUrl.pathname.replace(/\/$/, '');
    if (parsedUrl.origin !== publicBaseUrl.origin || !parsedUrl.pathname.startsWith(`${basePath}/`)) {
      throw new BadRequestException('Ссылка на фото не принадлежит S3-хранилищу Runich');
    }

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
}
