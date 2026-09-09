import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isPhotoStorageWriteEnabled } from 'src/common/config/environment';
import { DEFAULT_S3_ENDPOINT, DEFAULT_S3_REGION, MAX_DELETE_BATCH_SIZE } from './const';
import type { StorageFile, StorageSettings } from './type';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly settings: StorageSettings;
  private readonly client: S3Client;
  private readonly writesEnabled: boolean;

  constructor() {
    const endpoint = DEFAULT_S3_ENDPOINT;
    const region = DEFAULT_S3_REGION;
    const bucket = process.env.S3_BUCKET ?? '';
    const accessKey = process.env.S3_ACCESS_KEY ?? process.env.S3_ACCESS_KEY_ID ?? '';
    const secretKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_KEY ?? '';
    const publicUrl = (process.env.S3_PUBLIC_URL ?? `${endpoint}/${bucket}`).replace(/\/$/, '');

    this.settings = { endpoint, region, bucket, accessKey, secretKey, publicUrl };
    this.writesEnabled = isPhotoStorageWriteEnabled();
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
      this.assertWritesEnabled();
      this.assertConfigured();
      const extension = this.getExtension(file.originalname, file.mimetype);
      const key = `${userId}/${randomUUID()}.${extension}`;
      const body = file.path ? (stream = createReadStream(file.path)) : file.buffer;

      if (!body) throw new BadRequestException('Не удалось прочитать загруженный файл');

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
          Body: body,
          ...(file.size === undefined ? {} : { ContentLength: file.size }),
          ContentType: file.mimetype,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
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

  async deletePhoto(userId: string, publicUrl: string) {
    this.assertWritesEnabled();
    this.assertConfigured();
    const key = this.getOwnedKey(userId, publicUrl);

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
      }),
    );
  }

  async deleteUserFiles(userId: string) {
    if (!this.writesEnabled) return { deleted: 0 };
    this.assertConfigured();
    const prefix = `${userId}/`;
    let continuationToken: string | undefined;
    let deleted = 0;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.settings.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (page.Contents ?? []).map(({ Key }) => Key).filter((key): key is string => Boolean(key));

      for (let offset = 0; offset < keys.length; offset += MAX_DELETE_BATCH_SIZE) {
        const batch = keys.slice(offset, offset + MAX_DELETE_BATCH_SIZE);
        const result = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.settings.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
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

  private getOwnedKey(userId: string, publicUrl: string) {
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

  private assertWritesEnabled() {
    if (!this.writesEnabled) {
      throw new ServiceUnavailableException('Загрузка и удаление фото отключены в этой среде');
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
