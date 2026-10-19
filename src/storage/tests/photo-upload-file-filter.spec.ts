import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { photoUploadFileFilter } from '../photo-upload-file-filter';

describe('photoUploadFileFilter', () => {
  const request = {} as Express.Request;

  it.each([
    ['avatar.jpg', 'image/jpeg'],
    ['run.mp4', 'video/mp4'],
    ['run.mov', 'video/quicktime'],
    ['run.webm', 'video/webm'],
  ])('accepts supported media %s', (originalname, mimetype) => {
    const callback = jest.fn<(error: Error | null, acceptFile: boolean) => void>();

    photoUploadFileFilter(request, { originalname, mimetype } as Express.Multer.File, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it.each([
    ['run.mkv', 'video/x-matroska'],
    ['document.pdf', 'application/pdf'],
  ])('rejects unsupported media %s', (originalname, mimetype) => {
    const callback = jest.fn<(error: Error | null, acceptFile: boolean) => void>();

    photoUploadFileFilter(request, { originalname, mimetype } as Express.Multer.File, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(BadRequestException), false);
  });
});
