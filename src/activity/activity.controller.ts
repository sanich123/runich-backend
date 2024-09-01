import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Delete,
  Patch,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityDto } from './activity.dto';
import { ParamsId } from 'src/app/params-validation';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { PATHS } from 'src/utils/const';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { parseCsvFileIntoArray } from 'src/utils/parsers/parse-csv';
import { unzipTransferArchive } from 'src/utils/parsers/unzip-archive';
import { mapActivitiesWithCoordinates } from 'src/utils/parsers/map-activities-with-coordinates';
import { rm } from 'fs/promises';
const { activity, id } = PATHS;

@ApiTags(activity)
@Controller(activity)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get(`${id}/photos?`)
  @ApiOperation({ summary: 'Gets all photos saved by user in activities' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getMediaByUserId(@Param() { id }: ParamsId, @Query('take') take: string) {
    return this.activityService.getMediaByUserId(id, take);
  }

  @Get(`${id}/locations`)
  async getLocationsByActivityId(@Param() { id }: ParamsId) {
    return this.activityService.getLocationsByActivityId(id);
  }

  @Post('migration-strava/:id')
  @UseInterceptors(
    FileInterceptor('archive', {
      storage: diskStorage({
        destination: 'dist/receivedArchive',
        filename: (req, file, cb) => {
          cb(null, file.originalname);
        },
      }),
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async getArchiveWithActivitiesFromStrava(@UploadedFile() file: Express.Multer.File, @Param() { id }: ParamsId) {
    await unzipTransferArchive(file.path);
    const parsedDataFromCsv = await parseCsvFileIntoArray();
    const activitiesWithCoordinates = await mapActivitiesWithCoordinates(parsedDataFromCsv, id);
    console.log(activitiesWithCoordinates);
    // return await this.activityService.createActivitiesFromMigrationArchive(mappedActivities, id);
  }

  @Post(id)
  @ApiOperation({ summary: 'Post activity by userId' })
  @ApiParam({ name: 'userId', required: true, description: 'User identifer' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(HttpStatus.CREATED)
  async createActivity(@Body() activity: ActivityDto, @Param() { id }: ParamsId) {
    return await this.activityService.createActivity(activity, id);
  }

  @Patch(id)
  @HttpCode(HttpStatus.CREATED)
  async patchActivity(@Body() activity: ActivityDto, @Param() { id }: ParamsId) {
    return await this.activityService.updateActivity(activity, id);
  }

  @Get(`${id}?`)
  @ApiOperation({ summary: 'Get activities by userId' })
  @ApiParam({ name: 'userId', required: true, description: 'User identifer' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getActivitiesByUserId(@Param() { id }: ParamsId, @Query('page') page: string, @Query('take') take: string) {
    return await this.activityService.getActivitesByUserId(id, page, take);
  }

  @Get(`${id}/all?`)
  @ApiOperation({ summary: 'Get activities by userId and friends ids' })
  @ApiParam({ name: 'userId', required: true, description: 'User identifer' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAllActivitiesWithFriends(
    @Param() { id }: ParamsId,
    @Query('page') page: string,
    @Query('take') take: string,
  ) {
    return await this.activityService.getAllActivitiesWithFriends(id, page, take);
  }

  @Get(`/activityId/${id}`)
  @ApiOperation({ summary: 'Get activity by activity id' })
  @ApiParam({ name: 'activityId', required: true, description: 'Activity identifer' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getActivityByActivityId(@Param() { id }: ParamsId) {
    return await this.activityService.getActivityByActivityId(id);
  }

  @Delete(id)
  @ApiOperation({ summary: 'Delete activity by activity id' })
  @ApiParam({ name: 'activityId', required: true, description: 'Activity identifer' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteActivityById(@Param() { id }: ParamsId) {
    return await this.activityService.deleteActivityById(id);
  }
}
