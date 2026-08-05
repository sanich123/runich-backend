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
  UseGuards,
} from '@nestjs/common';
import { mkdir, rm } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { ActivityService } from './activity.service';
import { ActivityDto } from './activity.dto';
import { ParamsId } from 'src/app/params-validation';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { PATHS, QueryParams } from 'src/utils/const';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { parseCsvFileIntoArray } from 'src/utils/parsers/parse-csv';
import { unzipTransferArchive } from 'src/utils/parsers/unzip-archive';
import { mapActivitiesWithCoordinates } from 'src/utils/parsers/map-activities-with-coordinates';
import { AccountService } from 'src/account/account.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
const { activity, id } = PATHS;
const receivedArchiveDirectory = join(process.cwd(), 'dist', 'receivedArchive');
const migrationDirectory = join(process.cwd(), 'dist', 'migration');

@ApiTags(activity)
@Controller(activity)
export class ActivityController {
  constructor(
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
  ) {}

  @Get(`${id}/photos{.:take}`)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gets all photos saved by user in activities' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getMediaByUserId(@Param() { id }: ParamsId, @Query(QueryParams.take) take: string) {
    return this.activityService.getMediaByUserId(id, take);
  }

  @Get(`${id}/locations`)
  @UseGuards(JwtAuthGuard)
  async getLocationsByActivityId(@Param() { id }: ParamsId) {
    return this.activityService.getLocationsByActivityId(id);
  }

  @Get(`activityIds{.:ids}`)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activities by activities ids' })
  @ApiParam({ name: 'activityId', required: true, description: 'Activity identifer' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getActivitiesByActivitiesIds(@Query(QueryParams.ids) ids: string) {
    return this.activityService.getActivitiesByTheirIds(ids);
  }

  @Post('migration-strava/:id')
  @UseGuards(JwtAuthGuard)
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
    console.time('обработка архива');

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
      await Promise.all([
        file?.path ? rm(file.path, { force: true }) : Promise.resolve(),
        rm(migrationDirectory, { recursive: true, force: true }),
      ]);
      console.timeEnd('обработка архива');
    }
  }

  @Post(id)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Post activity by userId' })
  @ApiParam({ name: 'userId', required: true, description: 'User identifer' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(HttpStatus.CREATED)
  async createActivity(@Body() activity: ActivityDto, @Param() { id }: ParamsId) {
    return await this.activityService.createActivity(activity, id);
  }

  @Patch(id)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async patchActivity(@Body() activity: ActivityDto, @Param() { id }: ParamsId) {
    return await this.activityService.updateActivity(activity, id);
  }

  @Get(`${id}{.:page}{.:take}`)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activities by userId' })
  @ApiParam({ name: 'userId', required: true, description: 'User identifer' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getActivitiesByUserId(
    @Param() { id }: ParamsId,
    @Query(QueryParams.page) page: string,
    @Query(QueryParams.take) take: string,
  ) {
    return await this.activityService.getActivitesByUserId(id, page, take);
  }

  @Get(`${id}/all{.:page}{.:take}`)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activities by userId and friends ids' })
  @ApiParam({ name: 'userId', required: true, description: 'User identifer' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAllActivitiesWithFriends(
    @Param() { id }: ParamsId,
    @Query(QueryParams.page) page: string,
    @Query(QueryParams.take) take: string,
  ) {
    return await this.activityService.getAllActivitiesWithFriends(id, page, take);
  }

  @Get(`/activityId/${id}`)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activity by activity id' })
  @ApiParam({ name: 'activityId', required: true, description: 'Activity identifer' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getActivityByActivityId(@Param() { id }: ParamsId) {
    return await this.activityService.getActivityByActivityId(id);
  }

  @Delete(id)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete activity by activity id' })
  @ApiParam({ name: 'activityId', required: true, description: 'Activity identifer' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteActivityById(@Param() { id }: ParamsId) {
    return await this.activityService.deleteActivityById(id);
  }
}
