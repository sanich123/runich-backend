import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Inject,
  Optional,
  Post,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { isSupportedVideoUpload } from './const';
import {
  DeletePhotoDto,
  PhotoUploadBatchDto,
  PhotoUploadBatchResponseDto,
  PhotoUploadOptionsDto,
  PhotoUploadResponseDto,
} from './storage.dto';
import { StorageService } from './storage.service';
import { SubscriptionService } from 'src/subscription/subscription.service';

@ApiTags('photo')
@ApiBearerAuth('bearerAuth')
@Controller('photo')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(
    @Inject(StorageService) private readonly storageService: StorageService,
    @Optional() @Inject(SubscriptionService) private readonly subscriptionService?: SubscriptionService,
  ) {}

  private async requirePremiumForActivityUpload(
    userId: string,
    files: Array<Express.Multer.File | undefined>,
    scope?: string,
  ) {
    if ((scope ?? 'activity') !== 'activity') return;
    const cleanupTemporaryFiles = async () =>
      Promise.all(
        files
          .filter((file): file is Express.Multer.File => Boolean(file?.path))
          .map(({ path }) => rm(path, { force: true })),
      );
    let hasPremium: boolean;
    try {
      hasPremium = Boolean(await this.subscriptionService?.hasPremiumSubscription(userId));
    } catch (error) {
      await cleanupTemporaryFiles();
      throw error;
    }
    if (hasPremium) return;
    await cleanupTemporaryFiles();
    throw new ForbiddenException('Для загрузки фото и видео активности нужна подписка Runich Plus');
  }

  @Post('batch')
  @RateLimit(RATE_LIMITS.photoUpload.limit, RATE_LIMITS.photoUpload.ttl)
  @ApiOperation({ summary: 'Upload up to 10 photos or videos with a media manifest' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files', 'manifest'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          maxItems: UPLOAD_LIMITS.mediaBatchFiles,
        },
        manifest: { type: 'string', description: 'JSON array aligned with files' },
        scope: { type: 'string', enum: ['activity', 'profile', 'feedback'], default: 'activity' },
        feedbackId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiCreatedResponse({ type: [PhotoUploadBatchResponseDto] })
  @UseInterceptors(
    FilesInterceptor('files', UPLOAD_LIMITS.mediaBatchFiles, {
      storage: diskStorage({
        destination: join(tmpdir(), 'runich-photo-uploads'),
        filename: (_request, file, callback) => {
          const extension = extname(file.originalname)
            .toLowerCase()
            .replace(/[^a-z0-9.]/g, '');
          callback(null, `${randomUUID()}${extension}`);
        },
      }),
      limits: {
        fileSize: UPLOAD_LIMITS.videoBytes,
        files: UPLOAD_LIMITS.mediaBatchFiles,
        parts: UPLOAD_LIMITS.mediaBatchFiles + 3,
      },
      fileFilter: (_request, file, callback) => {
        const isImage = file.mimetype.startsWith('image/');
        const isSupportedVideo =
          file.mimetype.startsWith('video/') && isSupportedVideoUpload(file.originalname, file.mimetype);
        if (!isImage && !isSupportedVideo) {
          callback(new BadRequestException('Разрешены изображения и видео в форматах MP4, MOV и WebM'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadPhotos(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() request: AuthenticatedRequest,
    @Body() body: PhotoUploadBatchDto,
  ) {
    if (!files?.length) throw new BadRequestException('Не указаны файлы: files');
    const { manifest, ...options } = body;
    const userId = getAuthenticatedUserId(request);
    await this.requirePremiumForActivityUpload(userId, files, options.scope);
    return await this.storageService.uploadPhotos(userId, files, options, manifest);
  }

  @Post()
  @RateLimit(RATE_LIMITS.photoUpload.limit, RATE_LIMITS.photoUpload.ttl)
  @ApiOperation({ summary: 'Upload a photo or video to the current user storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        scope: { type: 'string', enum: ['activity', 'profile', 'feedback'], default: 'activity' },
        feedbackId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiCreatedResponse({ type: PhotoUploadResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      // Keep the upload outside of Node's heap. StorageService streams this
      // temporary file to S3 and removes it after the request completes.
      storage: diskStorage({
        destination: join(tmpdir(), 'runich-photo-uploads'),
        filename: (_request, file, callback) => {
          const extension = extname(file.originalname)
            .toLowerCase()
            .replace(/[^a-z0-9.]/g, '');
          callback(null, `${randomUUID()}${extension}`);
        },
      }),
      limits: { fileSize: UPLOAD_LIMITS.videoBytes, files: 1 },
      fileFilter: (_request, file, callback) => {
        const isImage = file.mimetype.startsWith('image/');
        const isSupportedVideo =
          file.mimetype.startsWith('video/') && isSupportedVideoUpload(file.originalname, file.mimetype);
        if (!isImage && !isSupportedVideo) {
          callback(new BadRequestException('Разрешены изображения и видео в форматах MP4, MOV и WebM'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadPhoto(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
    @Body() options: PhotoUploadOptionsDto = {},
  ) {
    if (!file) throw new BadRequestException('Не указан файл: file');
    const userId = getAuthenticatedUserId(request);
    await this.requirePremiumForActivityUpload(userId, [file], options.scope);
    return await this.storageService.uploadPhoto(userId, file, options);
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
