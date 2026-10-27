import { jest } from '@jest/globals';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { asyncMock } from 'src/tests/helpers';
import { makeActivityMediaFixture, makePhotoUpload } from './fixtures';
import { makeMoscowCoordinate } from 'src/tests/fixtures/geography.fixtures';
import { StorageService } from '../services/storage.service';
import { decodeActivityRoute, encodeActivityRoute } from '../activity-route';
import { getActivityPhotoKey, getExtensionFromStorageKey } from '../storage-key';
import { getStorageErrorMessage } from '../utils';

const s3Send = jest.spyOn(S3Client.prototype, 'send');

function createModerationPrismaMock() {
  return {
    mediaModerationAsset: {
      create: asyncMock(),
      findFirst: asyncMock(),
      findMany: asyncMock(),
      findUnique: asyncMock(),
      update: asyncMock(),
      updateMany: asyncMock(),
      delete: asyncMock(),
    },
    activityMedia: { findFirst: asyncMock(), findMany: asyncMock(), updateMany: asyncMock() },
    profile: { findFirst: asyncMock(), updateMany: asyncMock() },
  };
}

async function createTestImage() {
  return await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: { r: 220, g: 120, b: 40 } },
  })
    .png()
    .toBuffer();
}

describe('StorageService', () => {
  beforeEach(() => {
    process.env.S3_ENDPOINT = 'https://s3.twcstorage.ru';
    delete process.env.S3_REGION;
    process.env.S3_BUCKET = 'runich-test';
    process.env.S3_ACCESS_KEY = 'access-key';
    process.env.S3_SECRET_ACCESS_KEY = 'secret-key';
    process.env.S3_QUARANTINE_BUCKET = 'runich-test';
    process.env.S3_QUARANTINE_PREFIX = 'moderation-quarantine';
    delete process.env.APP_ENV;
    delete process.env.S3_PUBLIC_URL;
    s3Send.mockReset();
  });

  afterAll(() => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_REGION;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_QUARANTINE_BUCKET;
    delete process.env.S3_QUARANTINE_PREFIX;
    delete process.env.S3_PUBLIC_URL;
    delete process.env.APP_ENV;
    s3Send.mockRestore();
  });

  it('normalizes an image and uploads it under the authenticated user prefix', async () => {
    s3Send.mockResolvedValue({} as never);
    const metrics = { observeExternal: jest.fn() };
    const service = new StorageService(metrics as never);
    const image = await createTestImage();

    await expect(
      service.uploadPhoto(
        'user-1',
        {
          buffer: image,
          originalname: 'avatar.JPG',
          mimetype: 'image/jpeg',
        },
        { scope: 'feedback', feedbackId: 'feedback-1' },
      ),
    ).resolves.toMatchObject({
      url: expect.stringMatching(
        /^https:\/\/s3\.twcstorage\.ru\/runich-test\/user-1\/feedback\/\d{4}-\d{2}-\d{2}\/feedback-1\/.+\.webp$/,
      ),
      key: expect.stringMatching(/^user-1\/feedback\/\d{4}-\d{2}-\d{2}\/feedback-1\/.+\.webp$/),
      contentType: 'image/webp',
    });

    const command = s3Send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    const body = (command as PutObjectCommand).input.Body as Buffer;
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: 'runich-test',
      Body: expect.any(Buffer),
      ContentLength: body.length,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    await expect(sharp(body).metadata()).resolves.toMatchObject({ format: 'webp', width: 1600, height: 800 });
    expect(metrics.observeExternal).toHaveBeenCalledWith('s3', 'putObject', expect.any(Number));
  });

  it('uploads a manifest batch in input order and returns media metadata', async () => {
    s3Send.mockResolvedValue({} as never);
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.create.mockResolvedValueOnce({
      id: 'asset-1',
      status: 'queued',
      contentType: 'image/webp',
    });
    prisma.mediaModerationAsset.create.mockResolvedValueOnce({
      id: 'asset-2',
      status: 'queued',
      contentType: 'image/webp',
    });
    const service = new StorageService(undefined, prisma as never);
    const image = await createTestImage();
    const manifest = JSON.stringify([makeActivityMediaFixture(), { mediaId: 'media-2', role: 'media' }]);

    await expect(
      service.uploadPhotos(
        'user-1',
        [
          { buffer: image, originalname: 'one.jpg', mimetype: 'image/jpeg' },
          { buffer: image, originalname: 'two.jpg', mimetype: 'image/jpeg' },
        ],
        { scope: 'activity' },
        manifest,
      ),
    ).resolves.toMatchObject([
      {
        mediaId: 'media-1',
        role: 'media',
        status: 'queued',
        contentType: 'image/webp',
      },
      {
        mediaId: 'media-2',
        role: 'media',
        status: 'queued',
        contentType: 'image/webp',
      },
    ]);
    expect(s3Send).toHaveBeenCalledTimes(2);
    expect((s3Send.mock.calls[0]?.[0] as PutObjectCommand).input).toMatchObject({
      Bucket: 'runich-test',
      Key: expect.stringMatching(/^moderation-quarantine\/user-1\/.+\.webp$/),
      CacheControl: 'private, no-store',
    });
  });

  it('rejects a batch when manifest length does not match files', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();

    await expect(service.uploadPhotos('user-1', [makePhotoUpload()], {}, '[]')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('rejects a batch whose total size exceeds 250 MB', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();

    await expect(
      service.uploadPhotos(
        'user-1',
        [{ size: UPLOAD_LIMITS.mediaBatchBytes + 1, originalname: 'photo.jpg', mimetype: 'image/jpeg' }],
        {},
        JSON.stringify([makeActivityMediaFixture()]),
      ),
    ).rejects.toThrow('Суммарный размер файлов не должен превышать 250 МБ');
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('rejects an empty batch and a batch above the file limit', async () => {
    const service = new StorageService();

    await expect(service.uploadPhotos('user-1', [])).rejects.toThrow('Не указаны файлы: files');

    const files = Array.from({ length: 11 }, (_, index) => ({
      buffer: Buffer.from(`photo-${index}`),
      originalname: `photo-${index}.jpg`,
      mimetype: 'image/jpeg',
    }));
    await expect(service.uploadPhotos('user-1', files)).rejects.toThrow('Можно загрузить не более 10 файлов за раз');
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('treats a batch file without size or buffer as empty before upload', async () => {
    const service = new StorageService();

    await expect(
      service.uploadPhotos(
        'user-1',
        [{ originalname: 'photo.mp4', mimetype: 'video/mp4' }],
        {},
        JSON.stringify([makeActivityMediaFixture()]),
      ),
    ).rejects.toThrow('Не удалось прочитать загруженный файл');
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('cleans up successful uploads when one file in a batch fails', async () => {
    s3Send.mockResolvedValue({} as never);
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.create.mockResolvedValue({ id: 'asset-1', status: 'queued', contentType: 'video/mp4' });
    prisma.mediaModerationAsset.findFirst.mockResolvedValue({
      quarantineKey: 'moderation-quarantine/user-1/asset-1.mp4',
      publishedKey: null,
    });
    const service = new StorageService(undefined, prisma as never);
    const manifest = JSON.stringify([makeActivityMediaFixture(), { mediaId: 'media-2', role: 'media' }]);

    await expect(
      service.uploadPhotos(
        'user-1',
        [
          { buffer: Buffer.from('video'), originalname: 'one.mp4', mimetype: 'video/mp4' },
          { buffer: Buffer.from('video'), originalname: 'two.mkv', mimetype: 'video/x-matroska' },
        ],
        {},
        manifest,
      ),
    ).rejects.toThrow('Разрешены видео только в форматах MP4, MOV и WebM');

    expect(s3Send).toHaveBeenCalledTimes(2);
    expect(s3Send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect(s3Send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it.each([
    ['null entry', JSON.stringify([null])],
    ['invalid role', JSON.stringify([{ mediaId: 'media-1', role: 'original' }])],
  ])('rejects a manifest with an invalid %s', async (_caseName, manifest) => {
    const service = new StorageService();

    await expect(service.uploadPhotos('user-1', [makePhotoUpload()], {}, manifest)).rejects.toThrow(
      'Некорректная запись manifest медиафайлов',
    );
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('rejects duplicate media identifiers with the same role', async () => {
    const service = new StorageService();

    await expect(
      service.uploadPhotos(
        'user-1',
        [
          { buffer: Buffer.from('one'), originalname: 'one.jpg', mimetype: 'image/jpeg' },
          { buffer: Buffer.from('two'), originalname: 'two.jpg', mimetype: 'image/jpeg' },
        ],
        {},
        JSON.stringify([makeActivityMediaFixture(), makeActivityMediaFixture()]),
      ),
    ).rejects.toThrow('Manifest содержит пустой, слишком длинный или дублирующий mediaId и role');
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('uses the configured S3 endpoint for generated file URLs', async () => {
    s3Send.mockResolvedValue({} as never);
    process.env.S3_ENDPOINT = 'https://s3.stage.example';
    process.env.S3_REGION = 'stage-1';
    const service = new StorageService();
    expect((service as unknown as { settings: { region: string } }).settings.region).toBe('ru-1');

    await expect(
      service.uploadPhoto(
        'user-1',
        {
          buffer: Buffer.from('video'),
          originalname: 'clip.mp4',
          mimetype: 'video/mp4',
        },
        { scope: 'feedback', feedbackId: 'feedback-1' },
      ),
    ).resolves.toMatchObject({
      url: expect.stringMatching(
        /^https:\/\/s3\.stage\.example\/runich-test\/user-1\/feedback\/\d{4}-\d{2}-\d{2}\/feedback-1\/.+\.mp4$/,
      ),
    });
  });

  it('does not add optional flexible checksum headers for S3-compatible storage', async () => {
    const service = new StorageService();
    const client = (service as unknown as { client: S3Client }).client;
    const requestChecksumCalculation = client.config.requestChecksumCalculation;
    const responseChecksumValidation = client.config.responseChecksumValidation;

    await expect(
      typeof requestChecksumCalculation === 'function' ? requestChecksumCalculation() : requestChecksumCalculation,
    ).resolves.toBe('WHEN_REQUIRED');
    await expect(
      typeof responseChecksumValidation === 'function' ? responseChecksumValidation() : responseChecksumValidation,
    ).resolves.toBe('WHEN_REQUIRED');
  });

  it('uses webp for images even when the original file name has no extension', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();
    const image = await createTestImage();

    await expect(
      service.uploadPhoto(
        'user-1',
        {
          buffer: image,
          originalname: 'photo',
          mimetype: 'image/png',
        },
        { scope: 'feedback', feedbackId: 'feedback-1' },
      ),
    ).resolves.toMatchObject({
      key: expect.stringMatching(/^user-1\/feedback\/\d{4}-\d{2}-\d{2}\/feedback-1\/.+\.webp$/),
      contentType: 'image/webp',
    });
  });

  it('rejects an upload when neither a path nor a buffer is provided', async () => {
    const service = new StorageService();

    await expect(
      service.uploadPhoto('user-1', { originalname: 'photo.jpg', mimetype: 'image/jpeg' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('uses the binary fallback extension when a file has no usable extension', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();

    await expect(
      service.uploadPhoto(
        'user-1',
        { buffer: Buffer.from('binary'), originalname: 'file', mimetype: '' },
        { scope: 'feedback', feedbackId: 'feedback-1' },
      ),
    ).resolves.toMatchObject({
      key: expect.stringMatching(/^user-1\/feedback\/\d{4}-\d{2}-\d{2}\/feedback-1\/.+\.bin$/),
    });
  });

  it('does not default the endpoint and keeps the code-defined region when environment values are absent', () => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_REGION;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_QUARANTINE_BUCKET;
    delete process.env.S3_QUARANTINE_PREFIX;

    const service = new StorageService();

    expect((service as unknown as { settings: unknown }).settings).toEqual({
      endpoint: '',
      region: 'ru-1',
      bucket: '',
      quarantineBucket: '',
      quarantinePrefix: '',
      accessKey: '',
      secretKey: '',
      publicUrl: '',
    });
  });

  it('rejects unsupported video containers before writing to S3', async () => {
    const service = new StorageService();

    await expect(
      service.uploadPhoto('user-1', {
        buffer: Buffer.from('video'),
        originalname: 'clip.mkv',
        mimetype: 'video/x-matroska',
      }),
    ).rejects.toThrow('Разрешены видео только в форматах MP4, MOV и WebM');
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('moves a staged upload into the profile folder when it becomes an avatar', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();
    const stagedUrl = 'https://s3.twcstorage.ru/runich-test/user-1/uploads/avatar.webp';

    await expect(service.promoteProfilePhoto('user-1', stagedUrl)).resolves.toEqual(
      expect.stringMatching(
        /^https:\/\/s3\.twcstorage\.ru\/runich-test\/user-1\/profile\/\d{4}-\d{2}-\d{2}\/.+\.webp$/,
      ),
    );

    const copyCommand = s3Send.mock.calls[0]?.[0] as CopyObjectCommand;
    expect(copyCommand).toBeInstanceOf(CopyObjectCommand);
    expect(copyCommand.input).toMatchObject({
      Bucket: 'runich-test',
      Key: expect.stringMatching(/^user-1\/profile\/\d{4}-\d{2}-\d{2}\/.+\.webp$/),
      CopySource: 'runich-test/user-1/uploads/avatar.webp',
    });
    expect(s3Send.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ input: { Bucket: 'runich-test', Key: 'user-1/uploads/avatar.webp' } }),
    );
  });

  it('keeps an already-promoted or externally hosted profile photo unchanged', async () => {
    const service = new StorageService();
    const profileUrl = 'https://s3.twcstorage.ru/runich-test/user-1/profile/avatar.webp';
    const externalUrl = 'https://images.example/avatar.webp';

    await expect(service.promoteProfilePhoto('user-1', profileUrl)).resolves.toBe(profileUrl);
    await expect(service.promoteProfilePhoto('user-1', externalUrl)).resolves.toBe(externalUrl);
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('uploads a profile photo into quarantine before publishing it', async () => {
    s3Send.mockResolvedValue({} as never);
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.create.mockResolvedValue({
      id: 'profile-asset',
      status: 'queued',
      contentType: 'image/webp',
    });
    const service = new StorageService(undefined, prisma as never);
    const image = await createTestImage();

    await expect(
      service.uploadPhoto(
        'user-1',
        { buffer: image, originalname: 'avatar.jpg', mimetype: 'image/jpeg' },
        { scope: 'profile' },
      ),
    ).resolves.toMatchObject({
      assetId: 'profile-asset',
      status: 'queued',
      contentType: 'image/webp',
      previewUrl: expect.stringMatching(/^https:\/\/s3\.twcstorage\.ru\/runich-test\/moderation-quarantine\/user-1\//),
      blurhash: expect.any(String),
    });
    expect((s3Send.mock.calls[0]?.[0] as PutObjectCommand).input.Key).toMatch(
      /^moderation-quarantine\/user-1\/.+\.webp$/,
    );
  });

  it('uploads feedback media into the dated feedback folder', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();

    await expect(
      service.uploadPhoto(
        'user-1',
        { buffer: Buffer.from('video'), originalname: 'screen.mp4', mimetype: 'video/mp4' },
        { scope: 'feedback', feedbackId: 'feedback-1' },
      ),
    ).resolves.toMatchObject({
      key: expect.stringMatching(/^user-1\/feedback\/\d{4}-\d{2}-\d{2}\/feedback-1\/.+\.mp4$/),
      contentType: 'video/mp4',
    });
  });

  it('rejects feedback uploads without a feedback id', async () => {
    const service = new StorageService();

    await expect(
      service.uploadPhoto(
        'user-1',
        { buffer: Buffer.from('video'), originalname: 'screen.mp4', mimetype: 'video/mp4' },
        { scope: 'feedback' },
      ),
    ).rejects.toThrow('Для feedback-загрузки нужен feedbackId');
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('moves staged activity media into the activity photos folder', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();
    const stagedPhotoUrl = 'https://s3.twcstorage.ru/runich-test/user-1/uploads/activity.jpg';

    await expect(
      service.promoteActivityPhotos('user-1', 'activity-1', [{ url: stagedPhotoUrl, thumbnail: null }]),
    ).resolves.toMatchObject({
      photos: [
        {
          url: expect.stringMatching(
            /^https:\/\/s3\.twcstorage\.ru\/runich-test\/user-1\/activities\/activity-1\/\d{4}-\d{2}-\d{2}\/.+\.jpg$/,
          ),
          thumbnail: null,
        },
      ],
      keys: [expect.stringMatching(/^user-1\/activities\/activity-1\/\d{4}-\d{2}-\d{2}\/.+\.jpg$/)],
    });
  });

  it('keeps external activity media and reuses a destination for duplicate staged media', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();
    const stagedUrl = 'https://s3.twcstorage.ru/runich-test/user-1/uploads/activity.jpg';
    const externalUrl = 'https://images.example/activity.jpg';

    await expect(
      service.promoteActivityPhotos('user-1', 'activity-1', [
        { url: stagedUrl, thumbnail: stagedUrl },
        { url: externalUrl, thumbnail: null },
      ]),
    ).resolves.toMatchObject({
      photos: [
        {
          url: expect.stringMatching(
            /^https:\/\/s3\.twcstorage\.ru\/runich-test\/user-1\/activities\/activity-1\/\d{4}-\d{2}-\d{2}\/.+\.jpg$/,
          ),
          thumbnail: expect.stringMatching(
            /^https:\/\/s3\.twcstorage\.ru\/runich-test\/user-1\/activities\/activity-1\/\d{4}-\d{2}-\d{2}\/.+\.jpg$/,
          ),
        },
        { url: externalUrl, thumbnail: null },
      ],
      keys: [expect.stringMatching(/^user-1\/activities\/activity-1\/\d{4}-\d{2}-\d{2}\/.+\.jpg$/)],
    });
    expect(s3Send).toHaveBeenCalledTimes(2);
  });

  it('streams video disk uploads to S3 and removes the temporary file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'runich-storage-test-'));
    const path = join(directory, 'video.mp4');
    await writeFile(path, 'video');
    let streamedContent = '';
    s3Send.mockImplementation(async (command) => {
      const body = (command as PutObjectCommand).input.Body;
      expect(body).toBeInstanceOf(Readable);
      for await (const chunk of body as AsyncIterable<Uint8Array>) streamedContent += Buffer.from(chunk).toString();
      return {} as never;
    });
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.create.mockResolvedValue({
      id: 'video-asset',
      status: 'queued',
      contentType: 'video/mp4',
    });
    const service = new StorageService(undefined, prisma as never);

    await expect(
      service.uploadPhoto('user-1', {
        path,
        size: 5,
        originalname: 'video.mp4',
        mimetype: 'video/mp4',
      }),
    ).resolves.toMatchObject({ assetId: 'video-asset', status: 'queued', contentType: 'video/mp4' });

    expect(streamedContent).toBe('video');
    expect((s3Send.mock.calls[0]?.[0] as PutObjectCommand).input.ContentLength).toBe(5);
    await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(directory)).resolves.toBeUndefined();
  });

  it('uploads a migration archive to the user migration folder and removes the local copy', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'runich-storage-archive-test-'));
    const path = join(directory, 'strava-export.zip');
    await writeFile(path, 'archive');
    let streamedContent = '';
    s3Send.mockImplementation(async (command) => {
      const body = (command as PutObjectCommand).input.Body;
      expect(body).toBeInstanceOf(Readable);
      for await (const chunk of body as AsyncIterable<Uint8Array>) streamedContent += Buffer.from(chunk).toString();
      return {} as never;
    });
    const service = new StorageService();

    await expect(service.uploadMigrationArchive('user-1', 'migration-1', path)).resolves.toEqual({
      key: 'user-1/migrations/migration-1/archive.zip',
      url: 'https://s3.twcstorage.ru/runich-test/user-1/migrations/migration-1/archive.zip',
    });

    expect(streamedContent).toBe('archive');
    expect((s3Send.mock.calls[0]?.[0] as PutObjectCommand).input).toMatchObject({
      Bucket: 'runich-test',
      Key: 'user-1/migrations/migration-1/archive.zip',
      ContentLength: 7,
      ContentType: 'application/zip',
      CacheControl: 'private, no-store',
    });
    await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('downloads an S3 object to a local file for worker processing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'runich-storage-download-test-'));
    const path = join(directory, 'archive.zip');
    s3Send.mockResolvedValue({ Body: Readable.from(Buffer.from('archive')) } as never);
    const service = new StorageService();

    await service.downloadObjectToFile('user-1/migrations/migration-1/archive.zip', path);

    expect((s3Send.mock.calls[0]?.[0] as GetObjectCommand).input).toEqual({
      Bucket: 'runich-test',
      Key: 'user-1/migrations/migration-1/archive.zip',
    });
    await expect(readFile(path, 'utf8')).resolves.toBe('archive');
  });

  it('reports a missing S3 object when the response has no body', async () => {
    s3Send.mockResolvedValue({ Body: undefined } as never);
    const service = new StorageService();

    await expect(
      service.downloadObjectToFile('user-1/migrations/migration-1/archive.zip', join(tmpdir(), 'missing.zip')),
    ).rejects.toThrow('S3 не вернул объект user-1/migrations/migration-1/archive.zip');
  });

  it('maps a missing-object S3 error to the migration archive message', async () => {
    const missingObjectError = Object.assign(new Error('missing'), { name: 'NoSuchKey' });
    s3Send.mockImplementation(async () => {
      throw missingObjectError;
    });
    const service = new StorageService();

    await expect(
      service.downloadObjectToFile(
        'user-1/migrations/migration-1/archive.zip',
        join(tmpdir(), 'missing.zip'),
        'Файл архива миграции не найден',
      ),
    ).rejects.toThrow('Файл архива миграции не найден');
  });

  it('rethrows a non-object S3 error unchanged', async () => {
    s3Send.mockRejectedValueOnce(null as never);
    const service = new StorageService();

    await expect(
      service.downloadObjectToFile('user-1/migrations/migration-1/archive.zip', join(tmpdir(), 'failed.zip')),
    ).rejects.toBeNull();
  });

  it('reads JSON objects using the default missing-object message', async () => {
    s3Send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Buffer.from('{"ok":true}') },
    } as never);
    const service = new StorageService();

    await expect(service.readJson<{ ok: boolean }>('user-1/data.json')).resolves.toEqual({ ok: true });
  });

  it('omits CacheControl when a generic object has no cache policy', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();

    await expect(service.uploadObject('user-1/test.txt', Buffer.from('test'), 'text/plain')).resolves.toMatchObject({
      key: 'user-1/test.txt',
    });
    expect((s3Send.mock.calls[0]?.[0] as PutObjectCommand).input).not.toHaveProperty('CacheControl');
  });

  it('passes CacheControl when a generic object has a cache policy', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();

    await service.uploadObject('user-1/test.txt', Buffer.from('test'), 'text/plain', 'private, no-store');

    expect((s3Send.mock.calls[0]?.[0] as PutObjectCommand).input).toMatchObject({
      CacheControl: 'private, no-store',
    });
  });

  it('uploads a compressed activity route under the user and activity prefix', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();
    const locations = [{ timestamp: 1, coords: makeMoscowCoordinate() }];

    await expect(service.uploadActivityRoute('user-1', 'activity-1', locations)).resolves.toMatchObject({
      key: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
      formatVersion: 1,
      pointCount: 1,
      sizeBytes: expect.any(Number),
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const command = s3Send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'runich-test',
      Key: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
      ContentType: 'application/json',
      ContentEncoding: 'gzip',
      CacheControl: 'private, no-store',
    });
    await expect(decodeActivityRoute(command.input.Body as Buffer)).resolves.toEqual(locations);
  });

  it('reads and decompresses an activity route from S3', async () => {
    const locations = [{ timestamp: 1, coords: makeMoscowCoordinate() }];
    const encoded = await encodeActivityRoute(locations);
    s3Send.mockResolvedValue({ Body: { transformToByteArray: async () => encoded.body } } as never);
    const service = new StorageService();

    const routeKey = 'user-1/activities/activity-1/locations/locations-v1.json.gz';
    await expect(service.readActivityRoute(routeKey)).resolves.toEqual(locations);
    await expect(service.readActivityRoute(routeKey)).resolves.toEqual(locations);

    const command = s3Send.mock.calls[0]?.[0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'runich-test',
      Key: routeKey,
    });
    expect(s3Send).toHaveBeenCalledTimes(1);
  });

  it('rejects an activity route response without a body', async () => {
    s3Send.mockResolvedValue({ Body: undefined } as never);
    const service = new StorageService();

    await expect(
      service.readActivityRoute('user-1/activities/activity-1/locations/locations-v1.json.gz'),
    ).rejects.toThrow('S3 не вернул файл маршрута активности');
  });

  it('deletes only an object belonging to the authenticated user', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();

    await expect(
      service.deletePhoto('user-1', 'https://s3.twcstorage.ru/runich-test/user-1/photo.jpg'),
    ).resolves.toBeUndefined();

    const command = s3Send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect((command as DeleteObjectCommand).input).toEqual({ Bucket: 'runich-test', Key: 'user-1/photo.jpg' });

    await expect(
      service.deletePhoto('user-1', 'https://s3.twcstorage.ru/runich-test/other-user/photo.jpg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deletePhoto('user-1', 'https://evil.example/photo.jpg')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(s3Send).toHaveBeenCalledTimes(1);
  });

  it('rejects an S3 URL with an invalid encoded path', async () => {
    const service = new StorageService();

    await expect(service.deletePhoto('user-1', 'https://s3.twcstorage.ru/runich-test/user-1/%E0%A4%A')).rejects.toThrow(
      'Некорректный путь к фото',
    );
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('keeps nested non-upload storage paths unchanged during promotion', async () => {
    const service = new StorageService();
    const migrationUrl = 'https://s3.twcstorage.ru/runich-test/user-1/migrations/migration-1/archive.zip';

    await expect(service.promoteProfilePhoto('user-1', migrationUrl)).resolves.toBe(migrationUrl);
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('deletes legacy direct S3 URLs after switching public URLs to CDN', async () => {
    process.env.S3_PUBLIC_URL = 'https://cdn.example.com';
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();

    await expect(
      service.deletePhoto('user-1', 'https://s3.twcstorage.ru/runich-test/user-1/legacy-photo.jpg'),
    ).resolves.toBeUndefined();

    expect((s3Send.mock.calls[0]?.[0] as DeleteObjectCommand).input).toEqual({
      Bucket: 'runich-test',
      Key: 'user-1/legacy-photo.jpg',
    });
  });

  it('removes every object under a user prefix across paginated S3 listings', async () => {
    s3Send
      .mockResolvedValueOnce({
        Contents: [{ Key: 'user-1/one.jpg' }],
        IsTruncated: true,
        NextContinuationToken: 'next-page',
      } as never)
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({
        Contents: [{ Key: 'user-1/two.jpg' }, { Key: undefined }],
        IsTruncated: false,
      } as never)
      .mockResolvedValueOnce({} as never);
    const service = new StorageService();

    await expect(service.deleteUserFiles('user-1')).resolves.toEqual({ deleted: 2 });

    expect(s3Send.mock.calls[0]?.[0]).toBeInstanceOf(ListObjectsV2Command);
    expect((s3Send.mock.calls[0]?.[0] as ListObjectsV2Command).input).toEqual({
      Bucket: 'runich-test',
      Prefix: 'user-1/',
      ContinuationToken: undefined,
    });
    expect((s3Send.mock.calls[2]?.[0] as ListObjectsV2Command).input).toEqual({
      Bucket: 'runich-test',
      Prefix: 'user-1/',
      ContinuationToken: 'next-page',
    });
    expect((s3Send.mock.calls[1]?.[0] as DeleteObjectsCommand).input.Delete).toEqual({
      Objects: [{ Key: 'user-1/one.jpg' }],
      Quiet: true,
    });
    expect((s3Send.mock.calls[3]?.[0] as DeleteObjectsCommand).input.Delete).toEqual({
      Objects: [{ Key: 'user-1/two.jpg' }],
      Quiet: true,
    });
  });

  it('fails when S3 reports undeleted objects', async () => {
    s3Send
      .mockResolvedValueOnce({ Contents: [{ Key: 'user-1/one.jpg' }], IsTruncated: false } as never)
      .mockResolvedValueOnce({ Errors: [{ Key: 'user-1/one.jpg' }] } as never);
    const service = new StorageService();

    await expect(service.deleteUserFiles('user-1')).rejects.toThrow('S3 не удалил 1 объектов пользователя');
  });

  it('handles an empty S3 listing page when deleting user files', async () => {
    s3Send.mockResolvedValueOnce({ IsTruncated: false } as never);
    const service = new StorageService();

    await expect(service.deleteUserFiles('user-1')).resolves.toEqual({ deleted: 0 });
    expect(s3Send).toHaveBeenCalledTimes(1);
  });

  it('supports storage helper fallback and invalid-date errors', () => {
    expect(getActivityPhotoKey('user-1', 'activity-1', 'jpg')).toMatch(
      /^user-1\/activities\/activity-1\/\d{4}-\d{2}-\d{2}\/.*\.jpg$/,
    );
    expect(getExtensionFromStorageKey('user-1/no-extension')).toBe('bin');
    expect(() => getActivityPhotoKey('user-1', 'activity-1', 'jpg', new Date('invalid'))).toThrow(
      'Некорректная дата создания media-файла',
    );
    expect(getStorageErrorMessage({ reason: 'unavailable' })).toBe('[object Object]');
  });

  it('fails clearly when S3 credentials are not configured', async () => {
    delete process.env.S3_ACCESS_KEY;
    const service = new StorageService();

    await expect(
      service.uploadPhoto('user-1', { buffer: Buffer.alloc(0), originalname: 'photo.jpg', mimetype: 'image/jpeg' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('writes to the shared S3 bucket in stage', async () => {
    process.env.APP_ENV = 'stage';
    s3Send.mockResolvedValue({} as never);
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.create.mockResolvedValue({
      id: 'stage-asset',
      status: 'queued',
      contentType: 'image/webp',
    });
    const service = new StorageService(undefined, prisma as never);
    const image = await createTestImage();

    await expect(service.uploadPhoto('user-1', makePhotoUpload({ buffer: image }))).resolves.toMatchObject({
      assetId: 'stage-asset',
      status: 'queued',
      contentType: 'image/webp',
    });
    expect(s3Send).toHaveBeenCalledTimes(1);
    expect((s3Send.mock.calls[0]?.[0] as PutObjectCommand).input).toMatchObject({
      Bucket: 'runich-test',
      Key: expect.stringMatching(/^moderation-quarantine\/user-1\/.+\.webp$/),
      CacheControl: 'private, no-store',
    });
  });

  it('rejects image bytes that sharp cannot process', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();

    await expect(
      service.uploadPhoto('user-1', {
        buffer: Buffer.from('not-an-image'),
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('returns moderation statuses and exposes a URL only for approved published assets', async () => {
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findMany.mockResolvedValue([
      { id: 'approved-1', status: 'approved', publishedKey: 'user-1/uploads/approved.jpg', contentType: 'image/jpeg' },
      { id: 'approved-2', status: 'approved', publishedKey: null, contentType: 'image/jpeg' },
      { id: 'queued-1', status: 'queued', publishedKey: null, contentType: 'video/mp4' },
    ]);
    const service = new StorageService(undefined, prisma as never);

    await expect(
      service.getModerationUploadStatuses('user-1', ['approved-1', 'approved-2', 'queued-1']),
    ).resolves.toEqual({
      items: [
        {
          assetId: 'approved-1',
          status: 'approved',
          url: 'https://s3.twcstorage.ru/runich-test/user-1/uploads/approved.jpg',
          contentType: 'image/jpeg',
        },
        { assetId: 'approved-2', status: 'approved', contentType: 'image/jpeg' },
        { assetId: 'queued-1', status: 'queued', contentType: 'video/mp4' },
      ],
    });
    expect(prisma.mediaModerationAsset.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'user-1', id: { in: ['approved-1', 'approved-2', 'queued-1'] } },
      select: { id: true, status: true, publishedKey: true, contentType: true },
    });
    await expect(new StorageService().getModerationUploadStatuses('user-1', [])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns quarantine previews only for the owning user and only while an asset is reviewable', async () => {
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findMany.mockResolvedValue([
      {
        id: 'approved',
        status: 'approved',
        quarantineKey: 'moderation-quarantine/user-1/approved.webp',
        publishedKey: 'user-1/uploads/approved.webp',
      },
      {
        id: 'queued',
        status: 'queued',
        quarantineKey: 'moderation-quarantine/user-1/queued.webp',
        publishedKey: null,
      },
      {
        id: 'processing',
        status: 'processing',
        quarantineKey: 'moderation-quarantine/user-1/processing.webp',
        publishedKey: null,
      },
      {
        id: 'review-required',
        status: 'review_required',
        quarantineKey: 'moderation-quarantine/user-1/review-required.webp',
        publishedKey: null,
      },
      {
        id: 'failed',
        status: 'failed',
        quarantineKey: 'moderation-quarantine/user-1/failed.webp',
        publishedKey: null,
      },
      {
        id: 'rejected',
        status: 'rejected',
        quarantineKey: 'moderation-quarantine/user-1/rejected.webp',
        publishedKey: null,
      },
    ]);
    const service = new StorageService(undefined, prisma as never);

    const previews = await service.getOwnerModerationPreviewUrls('user-1', [
      null,
      'approved',
      'queued',
      'approved',
      undefined,
      'processing',
      'review-required',
      'failed',
      'rejected',
    ]);

    expect(previews.approved).toBe('https://s3.twcstorage.ru/runich-test/user-1/uploads/approved.webp');
    expect(previews.queued).toContain('/moderation-quarantine/user-1/queued.webp?');
    expect(previews.processing).toContain('/moderation-quarantine/user-1/processing.webp?');
    expect(previews['review-required']).toContain('/moderation-quarantine/user-1/review-required.webp?');
    expect(previews.failed).toContain('/moderation-quarantine/user-1/failed.webp?');
    expect(previews).not.toHaveProperty('rejected');
    expect(prisma.mediaModerationAsset.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'user-1',
        id: { in: ['approved', 'queued', 'processing', 'review-required', 'failed', 'rejected'] },
      },
      select: { id: true, status: true, quarantineKey: true, publishedKey: true },
    });
    await expect(service.getOwnerModerationPreviewUrls('user-1', [null, undefined])).resolves.toEqual({});
    await expect(new StorageService().getOwnerModerationPreviewUrls('user-1', ['asset-1'])).resolves.toEqual({});
    await expect(service.getOwnerModerationPreviewUrl('user-1', null)).resolves.toBeNull();
  });

  it('approves a reviewed asset, copies it to the public prefix, and syncs linked media', async () => {
    s3Send.mockResolvedValue({} as never);
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findUnique
      .mockResolvedValueOnce({
        id: 'asset-1',
        ownerId: 'user-1',
        role: 'media',
        status: 'review_required',
        quarantineKey: 'moderation-quarantine/user-1/asset-1.webp',
        publishedKey: null,
        contentType: 'image/webp',
        reviewedAt: null,
        reviewerId: null,
        reviewNote: null,
      })
      .mockResolvedValue({ role: 'media' });
    prisma.profile.findFirst.mockResolvedValue({ userId: 'user-1', profilePhotoPendingBlurhash: 'pending-hash' });
    const service = new StorageService(undefined, prisma as never);

    await expect(service.approveModerationAsset('asset-1', 'moderator-1', '  approved  ')).resolves.toEqual({
      url: 'https://s3.twcstorage.ru/runich-test/user-1/uploads/moderated/asset-1.webp',
      key: 'user-1/uploads/moderated/asset-1.webp',
    });
    expect(s3Send.mock.calls[0]?.[0]).toBeInstanceOf(CopyObjectCommand);
    expect((s3Send.mock.calls[0]?.[0] as CopyObjectCommand).input).toMatchObject({
      Bucket: 'runich-test',
      Key: 'user-1/uploads/moderated/asset-1.webp',
      CopySource: 'runich-test/moderation-quarantine/user-1/asset-1.webp',
    });
    expect(prisma.mediaModerationAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: expect.objectContaining({
        status: 'approved',
        reviewerId: 'moderator-1',
        reviewNote: 'approved',
        publishedKey: 'user-1/uploads/moderated/asset-1.webp',
      }),
    });
    expect(prisma.activityMedia.updateMany).toHaveBeenCalledWith({
      where: { mediaModerationAssetId: 'asset-1' },
      data: {
        url: 'https://s3.twcstorage.ru/runich-test/user-1/uploads/moderated/asset-1.webp',
        mediaReviewStatus: 'approved',
      },
    });
    expect(prisma.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', profilePhotoPendingAssetId: 'asset-1' },
      data: {
        profilePhoto: 'https://s3.twcstorage.ru/runich-test/user-1/uploads/moderated/asset-1.webp',
        profilePhotoBlurhash: 'pending-hash',
        profilePhotoPendingAssetId: null,
        profilePhotoPendingBlurhash: null,
        updatedAt: expect.any(Date),
      },
    });
    expect(s3Send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('preserves review metadata when an automated scan approves an asset without a moderator', async () => {
    s3Send.mockResolvedValue({} as never);
    const reviewedAt = new Date('2026-10-20T12:00:00.000Z');
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findUnique
      .mockResolvedValueOnce({
        id: 'asset-auto',
        ownerId: 'user-1',
        role: 'media',
        status: 'queued',
        quarantineKey: 'moderation-quarantine/user-1/asset-auto.webp',
        publishedKey: null,
        contentType: 'image/webp',
        reviewedAt,
        reviewerId: 'automatic-scanner',
        reviewNote: 'clean scan',
      })
      .mockResolvedValue({ role: 'media' });
    const service = new StorageService(undefined, prisma as never);

    await service.approveModerationAsset('asset-auto');

    expect(prisma.mediaModerationAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-auto' },
      data: expect.objectContaining({ reviewedAt, reviewerId: 'automatic-scanner', reviewNote: 'clean scan' }),
    });
  });

  it('keeps completed moderation decisions idempotent and rejects stale moderation actions', async () => {
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findUnique
      .mockResolvedValueOnce({
        id: 'asset-1',
        status: 'approved',
        role: 'thumbnail',
        publishedKey: 'user-1/uploads/approved.webp',
      })
      .mockResolvedValueOnce({ role: 'thumbnail' })
      .mockResolvedValueOnce({ id: 'asset-2', status: 'rejected' })
      .mockResolvedValueOnce({ id: 'asset-3', status: 'queued' })
      .mockResolvedValueOnce(null);
    const service = new StorageService(undefined, prisma as never);

    await expect(service.approveModerationAsset('asset-1')).resolves.toMatchObject({
      key: 'user-1/uploads/approved.webp',
    });
    expect(prisma.activityMedia.updateMany).toHaveBeenCalledWith({
      where: { thumbnailModerationAssetId: 'asset-1' },
      data: { thumbnail: 'https://s3.twcstorage.ru/runich-test/user-1/uploads/approved.webp' },
    });
    await expect(service.approveModerationAsset('asset-2')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.approveModerationAsset('asset-3', 'moderator-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.approveModerationAsset('missing')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.publishApprovedModerationAsset('user-1', 'asset-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a reviewed media asset and removes its linked thumbnail assets', async () => {
    s3Send.mockResolvedValue({} as never);
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findUnique
      .mockResolvedValueOnce({
        id: 'asset-1',
        ownerId: 'user-1',
        role: 'media',
        status: 'review_required',
        quarantineKey: 'moderation-quarantine/user-1/asset-1.mp4',
      })
      .mockResolvedValue({ role: 'media' });
    prisma.activityMedia.findMany.mockResolvedValue([{ thumbnailModerationAssetId: 'thumbnail-1' }]);
    prisma.profile.findFirst.mockResolvedValue({ userId: 'user-1', profilePhotoPendingBlurhash: 'pending-hash' });
    prisma.mediaModerationAsset.findFirst.mockResolvedValue({
      id: 'thumbnail-1',
      ownerId: 'user-1',
      quarantineKey: 'moderation-quarantine/user-1/thumbnail-1.webp',
      publishedKey: null,
    });
    const service = new StorageService(undefined, prisma as never);

    await service.rejectModerationAsset('asset-1', 'moderator-1', '  rejected  ');

    expect(prisma.mediaModerationAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: expect.objectContaining({ status: 'rejected', reviewerId: 'moderator-1', reviewNote: 'rejected' }),
    });
    expect(prisma.activityMedia.updateMany).toHaveBeenCalledWith({
      where: { mediaModerationAssetId: 'asset-1' },
      data: { url: null, mediaReviewStatus: 'rejected', thumbnail: null },
    });
    expect(prisma.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', profilePhotoPendingAssetId: 'asset-1' },
      data: {
        profilePhotoPendingAssetId: null,
        profilePhotoPendingBlurhash: null,
        updatedAt: expect.any(Date),
      },
    });
    expect(prisma.mediaModerationAsset.delete).toHaveBeenCalledWith({ where: { id: 'thumbnail-1' } });
    expect(s3Send).toHaveBeenCalledTimes(2);
  });

  it('refreshes approved, rejected, pending, and thumbnail references after activity updates', async () => {
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findUnique
      .mockResolvedValueOnce({ status: 'approved', role: 'media', publishedKey: 'user-1/approved.mp4' })
      .mockResolvedValueOnce({ role: 'media' })
      .mockResolvedValueOnce({ status: 'rejected', role: 'media', publishedKey: null })
      .mockResolvedValueOnce({ role: 'media' })
      .mockResolvedValueOnce({ status: 'queued', role: 'media', publishedKey: null })
      .mockResolvedValueOnce({ status: 'approved', role: 'thumbnail', publishedKey: 'user-1/thumbnail.webp' })
      .mockResolvedValueOnce({ role: 'thumbnail' });
    const service = new StorageService(undefined, prisma as never);

    await service.refreshLinkedActivityMedia(['asset-1', null, 'asset-1', 'asset-2', 'asset-3', 'asset-4']);

    expect(prisma.activityMedia.updateMany).toHaveBeenNthCalledWith(1, {
      where: { mediaModerationAssetId: 'asset-1' },
      data: { url: 'https://s3.twcstorage.ru/runich-test/user-1/approved.mp4', mediaReviewStatus: 'approved' },
    });
    expect(prisma.activityMedia.updateMany).toHaveBeenNthCalledWith(2, {
      where: { mediaModerationAssetId: 'asset-2' },
      data: { url: null, mediaReviewStatus: 'rejected', thumbnail: null },
    });
    expect(prisma.activityMedia.updateMany).toHaveBeenNthCalledWith(3, {
      where: { mediaModerationAssetId: 'asset-3' },
      data: { mediaReviewStatus: 'queued' },
    });
    expect(prisma.activityMedia.updateMany).toHaveBeenNthCalledWith(4, {
      where: { thumbnailModerationAssetId: 'asset-4' },
      data: { thumbnail: 'https://s3.twcstorage.ru/runich-test/user-1/thumbnail.webp' },
    });
  });

  it('deletes an unattached moderation asset and both object keys when it was already published', async () => {
    s3Send.mockResolvedValue({} as never);
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findFirst
      .mockResolvedValueOnce({
        id: 'asset-1',
        quarantineKey: 'moderation-quarantine/user-1/a.webp',
        publishedKey: null,
      })
      .mockResolvedValueOnce({
        id: 'asset-2',
        quarantineKey: 'moderation-quarantine/user-1/b.webp',
        publishedKey: 'user-1/b.webp',
      });
    prisma.activityMedia.findFirst.mockResolvedValue(null);
    const service = new StorageService(undefined, prisma as never);

    await service.deleteUnattachedModerationAsset('user-1', 'asset-1');
    await service.deleteUnattachedModerationAsset('user-1', 'asset-2');

    expect(prisma.mediaModerationAsset.delete).toHaveBeenNthCalledWith(1, { where: { id: 'asset-1' } });
    expect(prisma.mediaModerationAsset.delete).toHaveBeenNthCalledWith(2, { where: { id: 'asset-2' } });
    expect(s3Send).toHaveBeenCalledTimes(3);
    await expect(new StorageService().deleteUnattachedModerationAsset('user-1', 'asset-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects deleting missing or attached moderation assets and skips absent activity references', async () => {
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'asset-1',
      quarantineKey: 'moderation-quarantine/user-1/a.webp',
      publishedKey: null,
    });
    prisma.activityMedia.findFirst.mockResolvedValue({ id: 'media-1' });
    const service = new StorageService(undefined, prisma as never);

    await expect(service.deleteUnattachedModerationAsset('user-1', 'missing')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.deleteUnattachedModerationAsset('user-1', 'asset-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await service.deleteActivityModerationAssets('user-1', [null, 'asset-1', 'asset-1', 'missing']);
    expect(prisma.mediaModerationAsset.findFirst).toHaveBeenCalledTimes(4);
    expect(prisma.mediaModerationAsset.delete).not.toHaveBeenCalled();
  });

  it.each([
    [UPLOAD_LIMITS.photoBytes + 1, 'image/jpeg', 'photo.jpg', 'Размер изображения должен быть не более 15 МБ'],
    [UPLOAD_LIMITS.videoBytes + 1, 'video/mp4', 'clip.mp4', 'Размер видео должен быть не более 50 МБ'],
  ])('rejects an upload that exceeds its media type size limit', async (size, mimetype, originalname, message) => {
    const service = new StorageService(undefined, createModerationPrismaMock() as never);

    await expect(
      service.uploadPhoto('user-1', { buffer: Buffer.from('content'), size, mimetype, originalname }),
    ).rejects.toThrow(message);
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('requires Prisma and a separate quarantine prefix before uploading to a shared bucket', async () => {
    const file = { buffer: Buffer.from('video'), originalname: 'clip.mp4', mimetype: 'video/mp4' };
    await expect(new StorageService().uploadPhoto('user-1', file)).rejects.toBeInstanceOf(ServiceUnavailableException);

    delete process.env.S3_QUARANTINE_PREFIX;
    const service = new StorageService(undefined, createModerationPrismaMock() as never);
    await expect(service.uploadPhoto('user-1', file)).rejects.toThrow(
      'Для карантина в основном S3-бакете задайте S3_QUARANTINE_PREFIX',
    );
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('rejects invalid quarantine path segments during service configuration', () => {
    process.env.S3_QUARANTINE_PREFIX = 'moderation/../uploads';

    expect(() => new StorageService()).toThrow('S3_QUARANTINE_PREFIX contains an invalid path segment');
  });

  it('fails when a downloaded quarantine object has no response body', async () => {
    s3Send.mockResolvedValue({ Body: undefined } as never);
    const service = new StorageService();

    await expect(
      service.downloadQuarantineObjectToFile('moderation-quarantine/user-1/missing.jpg', '/tmp/missing.jpg'),
    ).rejects.toThrow('S3 не вернул карантинный объект moderation-quarantine/user-1/missing.jpg');
  });

  it('refuses to publish assets that are not approved or do not belong to the requester', async () => {
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findFirst.mockResolvedValue({ id: 'asset-1', status: 'queued' });
    const service = new StorageService(undefined, prisma as never);

    await expect(service.publishApprovedModerationAsset('owner-1', 'asset-1')).rejects.toThrow(
      'Модератор ещё не одобрил этот файл',
    );
    prisma.mediaModerationAsset.findFirst.mockResolvedValueOnce(null);
    await expect(service.publishApprovedModerationAsset('intruder', 'asset-1')).rejects.toThrow(
      'Загруженный файл не найден',
    );
  });

  it('treats missing moderation records and already rejected assets safely', async () => {
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'asset-rejected', status: 'rejected' })
      .mockResolvedValueOnce({ id: 'asset-queued', status: 'queued' });
    const service = new StorageService(undefined, prisma as never);

    await expect(service.rejectModerationAsset('missing', 'moderator-1')).rejects.toThrow('Загруженный файл не найден');
    await expect(service.rejectModerationAsset('asset-rejected', 'moderator-1')).resolves.toBeUndefined();
    await expect(service.rejectModerationAsset('asset-queued', 'moderator-1')).rejects.toThrow(
      'Этот файл больше не ожидает решения модератора',
    );
    await expect(new StorageService().rejectModerationAsset('asset-1', 'moderator-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not refresh moderation links when storage records are unavailable', async () => {
    await expect(new StorageService().refreshLinkedActivityMedia(['asset-1', null])).resolves.toBeUndefined();
    const prisma = createModerationPrismaMock();
    prisma.mediaModerationAsset.findUnique.mockResolvedValue(null);
    await expect(
      new StorageService(undefined, prisma as never).refreshLinkedActivityMedia(['missing']),
    ).resolves.toBeUndefined();
    expect(prisma.activityMedia.updateMany).not.toHaveBeenCalled();
  });
});
