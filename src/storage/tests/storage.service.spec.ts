import { jest } from '@jest/globals';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { StorageService } from '../storage.service';

const s3Send = jest.spyOn(S3Client.prototype, 'send');

describe('StorageService', () => {
  beforeEach(() => {
    process.env.S3_ENDPOINT = 'https://ignored.example';
    process.env.S3_REGION = 'ignored-region';
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

  it('uploads a file under the authenticated user prefix and returns its public URL', async () => {
    s3Send.mockResolvedValue({} as never);
    const metrics = { observeExternal: jest.fn() };
    const service = new StorageService(metrics as never);

    await expect(
      service.uploadPhoto('user-1', {
        buffer: Buffer.from('photo'),
        originalname: 'avatar.JPG',
        mimetype: 'image/jpeg',
      }),
    ).resolves.toMatchObject({
      url: expect.stringMatching(/^https:\/\/s3\.twcstorage\.ru\/runich-test\/user-1\/.+\.jpg$/),
      key: expect.stringMatching(/^user-1\/.+\.jpg$/),
      contentType: 'image/jpeg',
    });

    const command = s3Send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: 'runich-test',
      Body: Buffer.from('photo'),
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect((command as PutObjectCommand).input.Key).toMatch(/^user-1\/.+\.jpg$/);
    expect(metrics.observeExternal).toHaveBeenCalledWith('s3', 'putObject', expect.any(Number));
  });

  it('streams disk uploads to S3 and removes the temporary file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'runich-storage-test-'));
    const path = join(directory, 'photo.jpg');
    await writeFile(path, 'photo');
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
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
    });

    expect(streamedContent).toBe('photo');
    expect((s3Send.mock.calls[0]?.[0] as PutObjectCommand).input.ContentLength).toBe(5);
    await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(directory)).resolves.toBeUndefined();
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

    await expect(
      service.uploadPhoto('user-1', { buffer: Buffer.alloc(0), originalname: 'photo.jpg', mimetype: 'image/jpeg' }),
    ).resolves.toMatchObject({ contentType: 'image/jpeg' });
    expect(s3Send).toHaveBeenCalledTimes(1);
  });
});
