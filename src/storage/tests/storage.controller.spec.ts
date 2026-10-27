import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { asyncMock } from 'src/tests/helpers';
import { isSupportedVideoUpload } from '../const';
import { StorageController } from '../storage.controller';
import { StorageService } from '../services/storage.service';
import { makeActivityMediaFixture, makePhotoUpload } from './fixtures';

describe('StorageController', () => {
  const storageService = {
    uploadPhoto: asyncMock(),
    uploadPhotos: asyncMock(),
    deletePhoto: asyncMock(),
  };
  const controller = new StorageController(storageService as unknown as StorageService);
  const request = { user: { id: 'user-1' } } as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['video.mp4', 'video/mp4', true],
    ['video.mov', 'video/quicktime', true],
    ['video.webm', 'video/webm', true],
    ['video.mkv', 'video/x-matroska', false],
    ['video.avi', 'video/x-msvideo', false],
    ['video.mkv', 'video/mp4', false],
  ])('allows only MP4, MOV and WebM video uploads', (originalName, mimetype, expected) => {
    expect(isSupportedVideoUpload(originalName, mimetype)).toBe(expected);
  });

  it('passes the multipart file and authenticated user to the upload service', async () => {
    const file = makePhotoUpload() as Express.Multer.File;
    storageService.uploadPhoto.mockResolvedValue({ url: 'https://cdn.example/photo.jpg' });

    await expect(controller.uploadPhoto(file, request)).resolves.toEqual({ url: 'https://cdn.example/photo.jpg' });
    expect(storageService.uploadPhoto).toHaveBeenCalledWith('user-1', file, {});
  });

  it('rejects uploads without a file', async () => {
    await expect(controller.uploadPhoto(undefined, request)).rejects.toBeInstanceOf(BadRequestException);
    expect(storageService.uploadPhoto).not.toHaveBeenCalled();
  });

  it('passes a manifest batch to the upload service', async () => {
    const files = [
      { originalname: 'one.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('one') },
      { originalname: 'two.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('two') },
    ] as Express.Multer.File[];
    const body = {
      scope: 'activity' as const,
      manifest: JSON.stringify([makeActivityMediaFixture(), { mediaId: 'media-2', role: 'media' }]),
    };
    storageService.uploadPhotos.mockResolvedValue([
      makeActivityMediaFixture({ url: 'https://cdn.example/one.jpg' }),
      { mediaId: 'media-2', role: 'media', url: 'https://cdn.example/two.jpg' },
    ]);

    await expect(controller.uploadPhotos(files, request, body)).resolves.toHaveLength(2);
    expect(storageService.uploadPhotos).toHaveBeenCalledWith('user-1', files, { scope: 'activity' }, body.manifest);
  });

  it('rejects a batch without files', async () => {
    await expect(controller.uploadPhotos([], request, { manifest: '[]' })).rejects.toBeInstanceOf(BadRequestException);
    expect(storageService.uploadPhotos).not.toHaveBeenCalled();
  });

  it('allows activity media uploads for every account', async () => {
    const files = [{ originalname: 'one.jpg', mimetype: 'image/jpeg' }] as Express.Multer.File[];
    const body = {
      scope: 'activity' as const,
      manifest: JSON.stringify([makeActivityMediaFixture()]),
    };
    storageService.uploadPhotos.mockResolvedValue([makeActivityMediaFixture({ url: 'photo-url' })]);

    await expect(controller.uploadPhotos(files, request, body)).resolves.toEqual([
      makeActivityMediaFixture({ url: 'photo-url' }),
    ]);
    expect(storageService.uploadPhotos).toHaveBeenCalledWith('user-1', files, { scope: 'activity' }, body.manifest);
  });

  it('uploads profile media', async () => {
    const files = [{ originalname: 'avatar.jpg', mimetype: 'image/jpeg' }] as Express.Multer.File[];
    const body = {
      scope: 'profile' as const,
      manifest: JSON.stringify([makeActivityMediaFixture()]),
    };
    storageService.uploadPhotos.mockResolvedValue([makeActivityMediaFixture({ url: 'avatar-url' })]);

    await expect(controller.uploadPhotos(files, request, body)).resolves.toEqual([
      makeActivityMediaFixture({ url: 'avatar-url' }),
    ]);
    expect(storageService.uploadPhotos).toHaveBeenCalledWith('user-1', files, { scope: 'profile' }, body.manifest);
  });

  it('deletes the requested URL for the authenticated user', async () => {
    storageService.deletePhoto.mockResolvedValue(undefined);

    await expect(
      controller.deletePhoto({ url: 'https://s3.twcstorage.ru/runich-test/user-1/photo.jpg' }, request),
    ).resolves.toBeUndefined();
    expect(storageService.deletePhoto).toHaveBeenCalledWith(
      'user-1',
      'https://s3.twcstorage.ru/runich-test/user-1/photo.jpg',
    );
  });
});
