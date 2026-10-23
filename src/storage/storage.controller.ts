import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
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
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import { ParamsId } from 'src/common/dto/params-validation';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { photoUploadFileFilter } from './photo-upload-file-filter';
import {
  DeletePhotoDto,
  PhotoUploadBatchDto,
  PhotoUploadBatchResponseDto,
  PhotoUploadOptionsDto,
  PhotoUploadResponseDto,
} from './storage.dto';
import { StorageService } from './storage.service';

@ApiTags('photo')
@ApiBearerAuth('bearerAuth')
@Controller('photo')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  @Get('status')
  @RateLimit(RATE_LIMITS.mediaUploadStatus.limit, RATE_LIMITS.mediaUploadStatus.ttl)
  @ApiOperation({ summary: 'Get the current user moderation status for uploaded media' })
  async getUploadStatus(@Query('ids') ids: string | undefined, @Req() request: AuthenticatedRequest) {
    const assetIds =
      ids
        ?.split(',')
        .map((assetId) => assetId.trim())
        .filter(Boolean) ?? [];
    if (!assetIds.length || assetIds.length > UPLOAD_LIMITS.mediaBatchFiles) {
      throw new BadRequestException('Укажите от 1 до 10 идентификаторов загрузки');
    }
    return await this.storageService.getModerationUploadStatuses(getAuthenticatedUserId(request), assetIds);
  }

  @Post(':id/publish')
  @RateLimit(RATE_LIMITS.photoUpload.limit, RATE_LIMITS.photoUpload.ttl)
  @ApiOperation({ summary: 'Publish media explicitly approved by a moderator' })
  async publishApprovedUpload(@Param() { id }: ParamsId, @Req() request: AuthenticatedRequest) {
    return await this.storageService.publishApprovedModerationAsset(getAuthenticatedUserId(request), id);
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
      fileFilter: photoUploadFileFilter,
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
      fileFilter: photoUploadFileFilter,
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

  @Delete(':id')
  @RateLimit(RATE_LIMITS.photoDelete.limit, RATE_LIMITS.photoDelete.ttl)
  @ApiOperation({ summary: 'Delete a user-owned moderation upload that is not attached to an activity' })
  @ApiNoContentResponse({ description: 'Pending upload deleted' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteModerationUpload(@Param() { id }: ParamsId, @Req() request: AuthenticatedRequest) {
    await this.storageService.deleteUnattachedModerationAsset(getAuthenticatedUserId(request), id);
  }
}
