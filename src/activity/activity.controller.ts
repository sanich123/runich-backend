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
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest as RequestWithUser } from 'src/auth/auth-request';
import { mkdir, rm } from 'fs/promises';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { ActivityService } from './activity.service';
import { ActivityDto } from './activity.dto';
import {
  ActivityCardResponseDto,
  ActivityDetailsResponseDto,
  ActivityListResponseDto,
  ActivityLocationsResponseDto,
  ActivityMediaResponseDto,
  ActivityResponseDto,
} from './activity.response.dto';
import { ActivityMigrationJobParams, ActivityMigrationJobResponseDto } from './activity-migration.dto';
import { ActivityMigrationService } from './activity-migration.service';
import { getMigrationArchiveDirectory } from './activity-migration-storage';
import { ParamsId } from 'src/common/dto/params-validation';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PATHS, QueryParams } from 'src/common/constants';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AccountService } from 'src/account/account.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { validateOptionalIntegerQuery } from 'src/common/utils/query-validation';
import { isZipUpload, UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
const { activity, id } = PATHS;

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

  @Get(`${id}/photos`)
  @ApiOkResponse({ type: ActivityMediaResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gets all photos saved by user in activities' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiQuery({ name: 'take', required: false, description: 'Maximum number of photos' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getMediaByUserId(
    @Param() { id }: ParamsId,
    @Query(QueryParams.take) take?: string,
    @Req() request?: RequestWithUser,
  ) {
    return this.activityService.getMediaByUserId(
      id,
      validateOptionalIntegerQuery(take, QueryParams.take, { min: 1 }),
      request?.user.userId ?? request?.user.id,
    );
  }

  @Get(`${id}/locations`)
  @ApiOkResponse({ type: ActivityLocationsResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get locations by activity id' })
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
  async getActivitiesByActivitiesIds(@Query(QueryParams.ids) ids?: string | string[]) {
    const isValidIds =
      typeof ids === 'string'
        ? Boolean(ids.trim())
        : Array.isArray(ids) &&
          ids.length > 0 &&
          ids.every((activityId) => typeof activityId === 'string' && Boolean(activityId.trim()));
    if (!isValidIds) {
      throw new BadRequestException('Не указаны идентификаторы активностей: ids');
    }
    return this.activityService.getActivitiesByTheirIds(ids);
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
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'take', required: false, description: 'Count of results per page' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getActivitiesByUserId(
    @Param() { id }: ParamsId,
    @Query(QueryParams.page) page?: string,
    @Query(QueryParams.take) take?: string,
    @Req() request?: RequestWithUser,
  ) {
    const validatedPage = validateOptionalIntegerQuery(page, QueryParams.page);
    const validatedTake = validateOptionalIntegerQuery(take, QueryParams.take, { min: 1 });
    return await this.activityService.getActivitesByUserId(
      id,
      validatedPage,
      validatedTake,
      request?.user.userId ?? request?.user.id,
    );
  }

  @Get(`${id}/all`)
  @ApiOkResponse({ type: ActivityListResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activities by userId and friends ids' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'take', required: false, description: 'Count of results per page' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAllActivitiesWithFriends(
    @Param() { id }: ParamsId,
    @Query(QueryParams.page) page?: string,
    @Query(QueryParams.take) take?: string,
  ) {
    const validatedPage = validateOptionalIntegerQuery(page, QueryParams.page);
    const validatedTake = validateOptionalIntegerQuery(take, QueryParams.take, { min: 1 });
    return await this.activityService.getAllActivitiesWithFriends(id, validatedPage, validatedTake);
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
