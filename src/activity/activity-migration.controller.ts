import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import type { AuthenticatedRequest as RequestWithUser } from 'src/auth/request/auth-request';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AccountService } from 'src/account/account.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ParamsId } from 'src/common/dto/params-validation';
import { isZipUpload, UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import {
  ActivityMigrationJobParams,
  ActivityMigrationJobResponseDto,
  ActivityMigrationUploadStartDto,
} from './dto/activity.dto';
import { ActivityMigrationService } from './services/activity-migration.service';
import { MigrationArchiveUploadService } from './services/migration-archive-upload.service';
import { getMigrationArchiveDirectory } from './shared/activity-migration.utils';
import { activity } from './shared/const';

@ApiTags(activity)
@ApiBearerAuth('bearerAuth')
@Controller(activity)
export class ActivityMigrationController {
  constructor(
    @Inject(AccountService) private readonly accountService: AccountService,
    @Inject(ActivityMigrationService) private readonly activityMigrationService: ActivityMigrationService,
    @Inject(MigrationArchiveUploadService) private readonly archiveUploadService: MigrationArchiveUploadService,
  ) {}

  @Post('migration-strava/:id')
  @RateLimit(RATE_LIMITS.stravaImport.limit, RATE_LIMITS.stravaImport.ttl)
  @ApiResponse({ status: HttpStatus.ACCEPTED, type: ActivityMigrationJobResponseDto, description: 'Migration queued' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Import activities from a Strava archive' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archive: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('archive', {
      limits: { fileSize: UPLOAD_LIMITS.migrationArchiveBytes, files: 1 },
      fileFilter: (_request, file, callback) => {
        if (!isZipUpload(file.originalname)) {
          callback(new BadRequestException('Разрешены только ZIP-архивы'), false);
          return;
        }
        callback(null, true);
      },
      storage: diskStorage({
        destination: async (req, file: Express.Multer.File, cb) => {
          try {
            const archiveDirectory = getMigrationArchiveDirectory();
            await mkdir(archiveDirectory, { recursive: true });
            cb(null, archiveDirectory);
          } catch (error) {
            cb(error instanceof Error ? error : new Error(String(error)), getMigrationArchiveDirectory());
          }
        },
        filename: (req, file: Express.Multer.File, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
    }),
  )
  @HttpCode(HttpStatus.ACCEPTED)
  async getArchiveWithActivitiesFromStrava(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Param() { id }: ParamsId,
    @Req() request?: RequestWithUser,
  ) {
    try {
      if (!file) {
        throw new NotFoundException('Не указан файл архива: archive');
      }

      const currentUserId = request?.user.userId ?? request?.user.id;
      if (currentUserId && id !== currentUserId) throw new ForbiddenException('Недостаточно прав');
      const account = await this.accountService.getOrCreateAccountByUserId(currentUserId ?? id);
      if (!account) {
        throw new NotFoundException(`Профиль пользователя не найден: ${id}`);
      }

      return await this.activityMigrationService.enqueue({
        archivePath: file.path,
        userId: currentUserId ?? id,
        profileId: account.id,
      });
    } catch (error) {
      if (file?.path) await rm(file.path, { force: true });
      throw error;
    }
  }

  @Post('migration-strava/:id/start')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @RateLimit(RATE_LIMITS.stravaImport.limit, RATE_LIMITS.stravaImport.ttl)
  @ApiOperation({ summary: 'Create a Strava archive upload job' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ActivityMigrationJobResponseDto })
  async startStravaMigrationUpload(
    @Body() body: ActivityMigrationUploadStartDto,
    @Param() { id }: ParamsId,
    @Req() request?: RequestWithUser,
  ) {
    const currentUserId = request?.user.userId ?? request?.user.id;
    if (currentUserId && id !== currentUserId) throw new ForbiddenException('Недостаточно прав');
    const account = await this.accountService.getOrCreateAccountByUserId(currentUserId ?? id);
    if (!account) throw new NotFoundException(`Профиль пользователя не найден: ${id}`);

    return await this.activityMigrationService.startUpload({
      uploadBytesTotal: body.uploadBytesTotal,
      userId: currentUserId ?? id,
      profileId: account.id,
    });
  }

  @Post('migration-strava/jobs/:jobId/archive')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload a Strava archive into an existing migration job' })
  @ApiConsumes('application/zip')
  @ApiParam({ name: 'jobId', description: 'Migration job identifier' })
  @ApiResponse({ status: HttpStatus.ACCEPTED, type: ActivityMigrationJobResponseDto })
  async uploadStravaMigrationArchive(@Param() { jobId }: ActivityMigrationJobParams, @Req() request: RequestWithUser) {
    const currentUserId = request.user.userId ?? request.user.id;
    return await this.archiveUploadService.upload(request, jobId, currentUserId);
  }

  @Post('migration-strava/jobs/:jobId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancel an active Strava archive upload' })
  @ApiParam({ name: 'jobId', description: 'Migration job identifier' })
  @ApiOkResponse({ type: ActivityMigrationJobResponseDto })
  async cancelStravaMigration(@Param() { jobId }: ActivityMigrationJobParams, @Req() request: RequestWithUser) {
    const currentUserId = request.user.userId ?? request.user.id;
    return await this.activityMigrationService.cancel(jobId, currentUserId);
  }

  @Get('migration-strava/current')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the authenticated user’s active Strava migration, if any' })
  @ApiOkResponse({
    type: ActivityMigrationJobResponseDto,
    description: 'The active migration job, or null when the user has no active migration',
  })
  async getCurrentStravaMigrationStatus(@Req() request: RequestWithUser) {
    const currentUserId = request.user.userId ?? request.user.id;
    return await this.activityMigrationService.getCurrentJobForUser(currentUserId);
  }

  @Get('migration-strava/jobs/:jobId')
  @ApiOkResponse({ type: ActivityMigrationJobResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Strava migration status' })
  @ApiParam({ name: 'jobId', description: 'Migration job identifier' })
  async getStravaMigrationStatus(@Param() { jobId }: ActivityMigrationJobParams, @Req() request?: RequestWithUser) {
    const currentUserId = request?.user.userId ?? request?.user.id;
    return await this.activityMigrationService.getJobForUser(jobId, currentUserId ?? '');
  }
}
