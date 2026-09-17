import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { asyncMock } from 'src/tests/helpers';
import { StorageController } from '../storage.controller';
import { StorageService } from '../storage.service';

describe('StorageController', () => {
  const storageService = {
    uploadPhoto: asyncMock(),
    deletePhoto: asyncMock(),
  };
  const controller = new StorageController(storageService as unknown as StorageService);
  const request = { user: { id: 'user-1' } } as AuthenticatedRequest;

  beforeEach(() => jest.clearAllMocks());

  it('passes the multipart file and authenticated user to the upload service', async () => {
    const file = {
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('photo'),
    } as Express.Multer.File;
    storageService.uploadPhoto.mockResolvedValue({ url: 'https://cdn.example/photo.jpg' });

    await expect(controller.uploadPhoto(file, request)).resolves.toEqual({ url: 'https://cdn.example/photo.jpg' });
    expect(storageService.uploadPhoto).toHaveBeenCalledWith('user-1', file, {});
  });

  it('rejects uploads without a file', async () => {
    await expect(controller.uploadPhoto(undefined, request)).rejects.toBeInstanceOf(BadRequestException);
    expect(storageService.uploadPhoto).not.toHaveBeenCalled();
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
