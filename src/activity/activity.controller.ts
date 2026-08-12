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
  Logger,
} from '@nestjs/common';
import { mkdir, rm } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { ActivityService } from './activity.service';
import { ActivityDto } from './activity.dto';
import {
  ActivityCardResponseDto,
  ActivityDetailsResponseDto,
  ActivityImportResponseDto,
  ActivityListResponseDto,
  ActivityLocationsResponseDto,
  ActivityMediaResponseDto,
  ActivityResponseDto,
} from './activity.response.dto';
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
import { parseCsvFileIntoArray } from 'src/common/parsers/parse-csv';
import { unzipTransferArchive } from 'src/common/parsers/unzip-archive';
import { mapActivitiesWithCoordinates } from 'src/common/parsers/map-activities-with-coordinates';
import { AccountService } from 'src/account/account.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { validateOptionalIntegerQuery } from 'src/common/utils/query-validation';
const { activity, id } = PATHS;
const receivedArchiveDirectory = join(process.cwd(), 'dist', 'receivedArchive');
const migrationDirectory = join(process.cwd(), 'dist', 'migration');

@ApiTags(activity)
@ApiBearerAuth('bearerAuth')
@Controller(activity)
export class ActivityController {
  private readonly logger = new Logger(ActivityController.name);

  constructor(
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
  ) {}

  @Get(`${id}/photos`)
  @ApiOkResponse({ type: ActivityMediaResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gets all photos saved by user in activities' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiQuery({ name: 'take', required: false, description: 'Maximum number of photos' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getMediaByUserId(@Param() { id }: ParamsId, @Query(QueryParams.take) take?: string) {
    return this.activityService.getMediaByUserId(id, validateOptionalIntegerQuery(take, QueryParams.take, { min: 1 }));
  }

  @Get(`${id}/locations`)
  @ApiOkResponse({ type: ActivityLocationsResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get locations by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  async getLocationsByActivityId(@Param() { id }: ParamsId) {
    return this.activityService.getLocationsByActivityId(id);
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
      throw new BadRequestException('Activity ids are required');
    }
    return this.activityService.getActivitiesByTheirIds(ids);
  }

  @Post('migration-strava/:id')
  @ApiOkResponse({ type: ActivityImportResponseDto })
  @ApiResponse({ status: HttpStatus.CREATED, type: ActivityImportResponseDto, description: 'Success' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Import activities from a Strava archive' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archive: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('archive', {
      storage: diskStorage({
        destination: async (req, file: Express.Multer.File, cb) => {
          try {
            await mkdir(receivedArchiveDirectory, { recursive: true });
            cb(null, receivedArchiveDirectory);
          } catch (error) {
            cb(error instanceof Error ? error : new Error(String(error)), receivedArchiveDirectory);
          }
        },
        filename: (req, file: Express.Multer.File, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async getArchiveWithActivitiesFromStrava(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Param() { id }: ParamsId,
  ) {
    const startedAt = Date.now();

    try {
      if (!file) {
        throw new NotFoundException('Archive file is required');
      }

      const account = await this.accountService.getOrCreateAccountByUserId(id);
      if (!account) {
        throw new NotFoundException(`Profile for user ${id} was not found`);
      }

      await unzipTransferArchive(file.path);
      const parsedActivities = await parseCsvFileIntoArray();
      const activitiesWithCoordinates = await mapActivitiesWithCoordinates({
        parsedActivities,
        userId: id,
        profileId: account.id,
      });
      if (!activitiesWithCoordinates) return;
      return await this.activityService.createActivitiesFromMigrationArchive(activitiesWithCoordinates);
    } finally {
      const cleanupResults = await Promise.allSettled([
        file?.path ? rm(file.path, { force: true }) : Promise.resolve(),
        rm(migrationDirectory, { recursive: true, force: true }),
      ]);
      cleanupResults.forEach((result) => {
        if (result.status === 'rejected') {
          this.logger.error(
            'Failed to clean up migration files',
            result.reason instanceof Error ? result.reason.stack : String(result.reason),
          );
        }
      });
      this.logger.log(`Migration archive processed in ${Date.now() - startedAt}ms`);
    }
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
  async createActivity(@Body() activity: ActivityDto, @Param() { id }: ParamsId) {
    return await this.activityService.createActivity(activity, id);
  }

  @Patch(id)
  @ApiOkResponse({ type: ActivityResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update activity' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiBody({ type: ActivityDto })
  @ApiResponse({ status: HttpStatus.CREATED, type: ActivityResponseDto, description: 'Success' })
  @HttpCode(HttpStatus.CREATED)
  async patchActivity(@Body() activity: ActivityDto, @Param() { id }: ParamsId) {
    return await this.activityService.updateActivity(activity, id);
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
  ) {
    const validatedPage = validateOptionalIntegerQuery(page, QueryParams.page);
    const validatedTake = validateOptionalIntegerQuery(take, QueryParams.take, { min: 1 });
    return await this.activityService.getActivitesByUserId(id, validatedPage, validatedTake);
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
  async getActivityByActivityId(@Param() { id }: ParamsId) {
    return await this.activityService.getActivityByActivityId(id);
  }

  @Delete(id)
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete activity by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, schema: { type: 'null' }, description: 'No response body' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteActivityById(@Param() { id }: ParamsId) {
    return await this.activityService.deleteActivityById(id);
  }
}
