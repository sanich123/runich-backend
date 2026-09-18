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
import { StorageService } from '../storage.service';
import { decodeActivityRoute, encodeActivityRoute } from '../activity-route';

const s3Send = jest.spyOn(S3Client.prototype, 'send');

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
    process.env.S3_REGION = 'ru-1';
    process.env.S3_BUCKET = 'runich-test';
    process.env.S3_ACCESS_KEY = 'access-key';
    process.env.S3_SECRET_ACCESS_KEY = 'secret-key';
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
      service.uploadPhoto('user-1', {
        buffer: image,
        originalname: 'avatar.JPG',
        mimetype: 'image/jpeg',
      }),
    ).resolves.toMatchObject({
      url: expect.stringMatching(/^https:\/\/s3\.twcstorage\.ru\/runich-test\/user-1\/uploads\/.+\.webp$/),
      key: expect.stringMatching(/^user-1\/uploads\/.+\.webp$/),
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

  it('uses the configured S3 endpoint for generated file URLs', async () => {
    s3Send.mockResolvedValue({} as never);
    process.env.S3_ENDPOINT = 'https://s3.stage.example';
    process.env.S3_REGION = 'stage-1';
    const service = new StorageService();

    await expect(
      service.uploadPhoto('user-1', {
        buffer: Buffer.from('video'),
        originalname: 'clip.mp4',
        mimetype: 'video/mp4',
      }),
    ).resolves.toMatchObject({
      url: expect.stringMatching(/^https:\/\/s3\.stage\.example\/runich-test\/user-1\/uploads\/.+\.mp4$/),
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
      service.uploadPhoto('user-1', {
        buffer: image,
        originalname: 'photo',
        mimetype: 'image/png',
      }),
    ).resolves.toMatchObject({ key: expect.stringMatching(/^user-1\/uploads\/.+\.webp$/), contentType: 'image/webp' });
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
      service.uploadPhoto('user-1', { buffer: Buffer.from('binary'), originalname: 'file', mimetype: '' }),
    ).resolves.toMatchObject({ key: expect.stringMatching(/^user-1\/uploads\/.+\.bin$/) });
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

  it('uploads a profile photo directly into the dated profile folder', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();
    const image = await createTestImage();

    await expect(
      service.uploadPhoto(
        'user-1',
        { buffer: image, originalname: 'avatar.jpg', mimetype: 'image/jpeg' },
        { scope: 'profile' },
      ),
    ).resolves.toMatchObject({
      key: expect.stringMatching(/^user-1\/profile\/\d{4}-\d{2}-\d{2}\/.+\.webp$/),
      contentType: 'image/webp',
    });
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
    const service = new StorageService();

    await service.uploadPhoto('user-1', {
      path,
      size: 5,
      originalname: 'video.mp4',
      mimetype: 'video/mp4',
    });

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

  it('omits CacheControl when a generic object has no cache policy', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();

    await expect(service.uploadObject('user-1/test.txt', Buffer.from('test'), 'text/plain')).resolves.toMatchObject({
      key: 'user-1/test.txt',
    });
    expect((s3Send.mock.calls[0]?.[0] as PutObjectCommand).input).not.toHaveProperty('CacheControl');
  });

  it('uploads a compressed activity route under the user and activity prefix', async () => {
    s3Send.mockResolvedValue({} as never);
    const service = new StorageService();
    const locations = [{ timestamp: 1, coords: { latitude: 55.75, longitude: 37.61 } }];

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
    const locations = [{ timestamp: 1, coords: { latitude: 55.75, longitude: 37.61 } }];
    const encoded = await encodeActivityRoute(locations);
    s3Send.mockResolvedValue({ Body: { transformToByteArray: async () => encoded.body } } as never);
    const service = new StorageService();

    await expect(
      service.readActivityRoute('user-1/activities/activity-1/locations/locations-v1.json.gz'),
    ).resolves.toEqual(locations);

    const command = s3Send.mock.calls[0]?.[0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'runich-test',
      Key: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
    });
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
    const service = new StorageService();
    const image = await createTestImage();

    await expect(
      service.uploadPhoto('user-1', { buffer: image, originalname: 'photo.jpg', mimetype: 'image/jpeg' }),
    ).resolves.toMatchObject({ contentType: 'image/webp' });
    expect(s3Send).toHaveBeenCalledTimes(1);
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
});
