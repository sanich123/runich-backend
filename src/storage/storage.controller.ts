import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { DeletePhotoDto, PhotoUploadResponseDto } from './storage.dto';
import { StorageService } from './storage.service';

@ApiTags('photo')
@ApiBearerAuth('bearerAuth')
@Controller('photo')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  @Post()
  @RateLimit(RATE_LIMITS.photoUpload.limit, RATE_LIMITS.photoUpload.ttl)
  @ApiOperation({ summary: 'Upload a photo or video to the current user storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiCreatedResponse({ type: PhotoUploadResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: UPLOAD_LIMITS.photoBytes, files: 1 },
      fileFilter: (_request, file, callback) => {
        if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
          callback(new BadRequestException('Разрешены только изображения и видео'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadPhoto(@UploadedFile() file: Express.Multer.File | undefined, @Req() request: AuthenticatedRequest) {
    if (!file) throw new BadRequestException('Не указан файл: file');
    return await this.storageService.uploadPhoto(getAuthenticatedUserId(request), file);
  }

  @Delete()
  @RateLimit(RATE_LIMITS.photoDelete.limit, RATE_LIMITS.photoDelete.ttl)
  @ApiOperation({ summary: 'Delete one photo or video owned by the current user' })
  @ApiBody({ type: DeletePhotoDto })
  @ApiNoContentResponse({ description: 'Photo deleted' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePhoto(@Body() { url }: DeletePhotoDto, @Req() request: AuthenticatedRequest) {
    await this.storageService.deletePhoto(getAuthenticatedUserId(request), url);
  }
}
