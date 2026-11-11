import {
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
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest as RequestWithUser } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ActivityService } from './services/activity.service';
import {
  ActivityChartDataResponseDto,
  ActivityLocationsResponseDto,
  ActivityMediaAppendDto,
  ActivityMediaParamsDto,
  ActivityMediaResponseDto,
  ActivityRouteLocationsDto,
} from './dto/activity.dto';
import { ParamsId } from 'src/common/dto/params-validation';
import { QueryParams } from 'src/common/constants';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { validateOptionalIntegerQuery } from 'src/common/utils/query-validation';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import { activity, id } from './shared/const';
import { parseActivityMediaCursor } from './shared/activity.pagination';

@ApiTags(activity)
@ApiBearerAuth('bearerAuth')
@Controller(activity)
export class ActivityMediaController {
  constructor(@Inject(ActivityService) private readonly activityService: ActivityService) {}

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

  @Post(`${id}/locations/raw`)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload the full activity route after the activity has been saved' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiBody({ type: ActivityRouteLocationsDto })
  @ApiNoContentResponse({ description: 'Full route uploaded' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async uploadRawActivityLocations(
    @Param() { id }: ParamsId,
    @Body() { locations }: ActivityRouteLocationsDto,
    @Req() request: RequestWithUser,
  ) {
    await this.activityService.uploadRawActivityLocations(id, getAuthenticatedUserId(request), locations);
  }

  @Get(`${id}/locations`)
  @ApiOkResponse({ type: ActivityLocationsResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activity route locations; only owners can request raw points' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiQuery({ name: 'raw', required: false, type: Boolean, description: 'Return full route for the activity owner' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  async getLocationsByActivityId(
    @Param() { id }: ParamsId,
    @Req() request: RequestWithUser,
    @Query('raw') raw?: string,
  ) {
    return this.activityService.getLocationsByActivityId(id, getAuthenticatedUserId(request), raw === 'true');
  }

  @Get(`${id}/chart-data`)
  @ApiOkResponse({ type: ActivityChartDataResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get activity chart data' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  async getChartDataByActivityId(@Param() { id }: ParamsId, @Req() request: RequestWithUser) {
    return this.activityService.getChartDataByActivityId(id, getAuthenticatedUserId(request));
  }
}
