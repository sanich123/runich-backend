import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { isSupportedVideoUpload } from './const';

export const photoUploadFileFilter: NonNullable<MulterOptions['fileFilter']> = (_request, file, callback) => {
  const isImage = file.mimetype.startsWith('image/');
  const isSupportedVideo =
    file.mimetype.startsWith('video/') && isSupportedVideoUpload(file.originalname, file.mimetype);
  if (!isImage && !isSupportedVideo) {
    callback(new BadRequestException('Разрешены изображения и видео в форматах MP4, MOV и WebM'), false);
    return;
  }
  callback(null, true);
};
