import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Delete,
  Patch,
  Query,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
  BadRequestException,
  UseGuards,
  ForbiddenException,
  ConflictException,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest as RequestWithUser } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { isUUID } from 'class-validator';
import { ActivityService } from './activity.service';
import { ActivityDto, ActivityMediaAppendDto, ActivityMediaParamsDto } from './activity.dto';
import {
  ActivityCardResponseDto,
  ActivityDetailsResponseDto,
  ActivityListResponseDto,
  ActivityLocationsResponseDto,
  ActivityMediaResponseDto,
  ActivityResponseDto,
} from './activity.dto';
import {
  ActivityMigrationJobParams,
  ActivityMigrationJobResponseDto,
  ActivityMigrationUploadStartDto,
} from './activity.dto';
import { ActivityMigrationService } from './activity-migration.service';
import { getMigrationArchiveDirectory, getMigrationIncomingArchivePath } from './activity-migration-storage';
import { ParamsId } from 'src/common/dto/params-validation';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { QueryParams } from 'src/common/constants';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AccountService } from 'src/account/account.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { validateOptionalIntegerQuery } from 'src/common/utils/query-validation';
import { isZipUpload, UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import { activity, id } from './const';
import { parseActivityCursor, parseActivityMediaCursor } from './activity.pagination';

function normalizeActivityIdsQuery(ids?: string | string[]) {
  return (Array.isArray(ids) ? ids : [ids ?? ''])
    .flatMap((activityId) => activityId.split(/[&,]/))
    .map((activityId) => activityId.trim().replace(/^ids=/, ''));
}

@ApiTags(activity)
@ApiBearerAuth('bearerAuth')
@Controller(activity)
export class ActivityController {
  constructor(
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
    @Inject(ActivityMigrationService)
    private readonly activityMigrationService: ActivityMigrationService,
  ) {}

  @Get(`${id}/media`)
  @ApiOkResponse({ type: ActivityMediaResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gets all media saved by user in activities' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor from the previous response' })
  @ApiQuery({ name: 'take', required: false, description: 'Maximum number of photos' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getMediaByUserId(
    @Param() { id }: ParamsId,
    @Query(QueryParams.cursor) cursor?: string,
    @Query(QueryParams.take) take?: string,
    @Req() request?: RequestWithUser,
  ) {
    return this.activityService.getMediaByUserId(
      id,
      validateOptionalIntegerQuery(take, QueryParams.take, { min: 1 }),
      parseActivityMediaCursor(cursor),
      request?.user.userId ?? request?.user.id,
    );
  }

  @Post(id + '/media')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Append photos or videos to an activity' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Activity media saved' })
  @HttpCode(HttpStatus.CREATED)
  async appendActivityMedia(
    @Param() { id }: ParamsId,
    @Body() body: ActivityMediaAppendDto,
    @Req() request: RequestWithUser,
  ) {
    return this.activityService.appendActivityMedia(id, getAuthenticatedUserId(request), body.media);
  }

  @Delete(`${id}/media/:mediaId`)
  @RateLimit(RATE_LIMITS.photoDelete.limit, RATE_LIMITS.photoDelete.ttl)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete one photo or video from an owned activity' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiParam({ name: 'mediaId', description: 'Activity media identifier' })
  @ApiNoContentResponse({ description: 'Activity media deleted' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteActivityMedia(@Param() { id, mediaId }: ActivityMediaParamsDto, @Req() request: RequestWithUser) {
    await this.activityService.deleteActivityMedia(id, mediaId, getAuthenticatedUserId(request));
  }

  @Get(`${id}/locations`)
  @ApiOkResponse({ type: ActivityLocationsResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activity locations for route replay' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  async getLocationsByActivityId(@Param() { id }: ParamsId, @Req() request?: RequestWithUser) {
    return this.activityService.getLocationsByActivityId(id, request?.user.userId ?? request?.user.id);
  }

  @Get('activityIds')
  @ApiOkResponse({ type: [ActivityCardResponseDto] })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activities by activities ids' })
  @ApiQuery({
    name: 'ids',
    required: true,
    isArray: true,
    description: 'Activity ids (repeated or comma-separated)',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getActivitiesByActivitiesIds(
    @Query(QueryParams.ids) ids?: string | string[],
    @Req() request?: RequestWithUser,
  ) {
    const normalizedIds = normalizeActivityIdsQuery(ids);
    if (!normalizedIds.length) {
      throw new BadRequestException('Не указаны идентификаторы активностей: ids');
    }
    if (normalizedIds.some((activityId) => !isUUID(activityId))) {
      throw new BadRequestException('Некорректные идентификаторы активностей: ids');
    }
    return this.activityService.getActivitiesByTheirIds(normalizedIds, request?.user.userId ?? request?.user.id);
  }

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
    const job = await this.activityMigrationService.getJobForUser(jobId, currentUserId);
    if (job.status !== 'uploading') throw new ConflictException('Загрузка архива уже завершена или отменена');

    const contentLength = Number(request.headers['content-length'] ?? 0);
    const expectedBytes = job.uploadBytesTotal || contentLength;
    if (contentLength > UPLOAD_LIMITS.migrationArchiveBytes || expectedBytes > UPLOAD_LIMITS.migrationArchiveBytes) {
      throw new BadRequestException('Размер архива превышает допустимый лимит');
    }

    const archivePath = getMigrationIncomingArchivePath(jobId);
    await mkdir(getMigrationArchiveDirectory(), { recursive: true });
    let receivedBytes = 0;
    let lastReportedBytes = 0;
    let lastReportedAt = 0;
    let reportChain = Promise.resolve();
    const reportProgress = (force = false) => {
      const now = Date.now();
      if (!force && now - lastReportedAt < 500 && receivedBytes - lastReportedBytes < 1024 * 1024) {
        return reportChain;
      }
      lastReportedAt = now;
      lastReportedBytes = receivedBytes;
      reportChain = reportChain.then(async () => {
        await this.activityMigrationService.updateUploadProgress(jobId, currentUserId, receivedBytes, expectedBytes);
      });
      return reportChain;
    };
    const countingStream = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        receivedBytes += chunk.length;
        if (receivedBytes > UPLOAD_LIMITS.migrationArchiveBytes || receivedBytes > expectedBytes) {
          callback(new BadRequestException('Размер архива не совпадает с заявленным размером'));
          return;
        }
        void reportProgress();
        callback(null, chunk);
      },
    });

    try {
      await pipeline(request, countingStream, createWriteStream(archivePath));
      await reportProgress(true);
      if (expectedBytes > 0 && receivedBytes !== expectedBytes) {
        throw new BadRequestException('Загрузка архива завершилась не полностью');
      }
      return await this.activityMigrationService.finishUpload(jobId, currentUserId, archivePath);
    } catch (error) {
      await rm(archivePath, { force: true });
      await this.activityMigrationService
        .markUploadFailed(jobId, currentUserId, error instanceof Error ? error.message : 'Загрузка архива прервана')
        .catch(() => undefined);
      throw error;
    }
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

  @Post(id)
  @ApiOkResponse({ type: ActivityResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Post activity by userId' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiBody({ type: ActivityDto })
  @ApiResponse({ status: HttpStatus.CREATED, type: ActivityResponseDto, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(HttpStatus.CREATED)
  async createActivity(@Body() activity: ActivityDto, @Param() { id }: ParamsId, @Req() request?: RequestWithUser) {
    const currentUserId = request?.user.userId ?? request?.user.id ?? id;
    if (currentUserId !== id) throw new ForbiddenException('Недостаточно прав');
    return await this.activityService.createActivity(activity, currentUserId);
  }

  @Patch(id)
  @ApiOkResponse({ type: ActivityResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update activity' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiBody({ type: ActivityDto })
  @ApiResponse({ status: HttpStatus.CREATED, type: ActivityResponseDto, description: 'Success' })
  @HttpCode(HttpStatus.CREATED)
  async patchActivity(@Body() activity: ActivityDto, @Param() { id }: ParamsId, @Req() request?: RequestWithUser) {
    return await this.activityService.updateActivity(activity, id, request?.user.userId ?? request?.user.id ?? id);
  }

  @Get(id)
  @ApiOkResponse({ type: ActivityListResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activities by userId' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor from the previous response' })
  @ApiQuery({ name: 'take', required: false, description: 'Count of results per page' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getActivitiesByUserId(
    @Param() { id }: ParamsId,
    @Query(QueryParams.cursor) cursor?: string,
    @Query(QueryParams.take) take?: string,
    @Req() request?: RequestWithUser,
  ) {
    const validatedTake = validateOptionalIntegerQuery(take, QueryParams.take, { min: 1 });
    return await this.activityService.getActivitesByUserId(
      id,
      validatedTake,
      parseActivityCursor(cursor),
      request?.user.userId ?? request?.user.id,
    );
  }

  @Get(`${id}/all`)
  @ApiOkResponse({ type: ActivityListResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activities by userId and friends ids' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor from the previous response' })
  @ApiQuery({ name: 'take', required: false, description: 'Count of results per page' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAllActivitiesWithFriends(
    @Param() { id }: ParamsId,
    @Query(QueryParams.cursor) cursor?: string,
    @Query(QueryParams.take) take?: string,
    @Req() request?: RequestWithUser,
  ) {
    const validatedTake = validateOptionalIntegerQuery(take, QueryParams.take, { min: 1 });
    return await this.activityService.getAllActivitiesWithFriends(
      id,
      validatedTake,
      parseActivityCursor(cursor),
      request?.user.userId ?? request?.user.id,
    );
  }

  @Get(`/activityId/${id}`)
  @ApiOkResponse({ type: ActivityDetailsResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activity by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getActivityByActivityId(@Param() { id }: ParamsId, @Req() request?: RequestWithUser) {
    return await this.activityService.getActivityByActivityId(id, request?.user.userId ?? request?.user.id);
  }

  @Delete(id)
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete activity by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, schema: { type: 'null' }, description: 'No response body' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteActivityById(@Param() { id }: ParamsId, @Req() request?: RequestWithUser) {
    return await this.activityService.deleteActivityById(id, request?.user.userId ?? request?.user.id ?? id);
  }
}
