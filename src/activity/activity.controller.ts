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
  BadRequestException,
  UseGuards,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest as RequestWithUser } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { isUUID } from 'class-validator';
import { ActivityService } from './services/activity.service';
import {
  ActivityDto,
  SetActivityFavoriteDto,
  WatchWorkoutBatchImportDto,
  WatchWorkoutBatchImportResponseDto,
  WatchWorkoutSyncCandidatesRequestDto,
  WatchWorkoutSyncCandidatesResponseDto,
} from './dto/activity.dto';
import {
  ActivityCardResponseDto,
  ActivityDetailsResponseDto,
  ActivityListResponseDto,
  ActivitiesWithRoutesResponseDto,
  HomeActivityFeedsResponseDto,
  ActivityResponseDto,
} from './dto/activity.dto';
import { ParamsId } from 'src/common/dto/params-validation';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { QueryParams } from 'src/common/constants';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  parsePageSizeQuery,
  validateOptionalIanaTimeZoneQuery,
  validateOptionalIntegerQuery,
} from 'src/common/utils/query-validation';
import {
  ACTIVITY_FAVORITE_API_COPY,
  ACTIVITY_FAVORITE_ROUTE,
  ACTIVITY_FAVORITES_ROUTE,
  ACTIVITY_HOME_ROUTE,
  ACTIVITY_WITH_ROUTES_ROUTE,
  activity,
  id,
} from './shared/const';
import { parseActivityCursor } from './shared/activity.pagination';

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
  ) {}

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

  @Post(id + '/watch-import')
  @ApiCreatedResponse({ type: WatchWorkoutBatchImportResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Import completed workouts from a connected watch health store' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiBody({ type: WatchWorkoutBatchImportDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(HttpStatus.CREATED)
  async importWatchWorkouts(
    @Body() body: WatchWorkoutBatchImportDto,
    @Param() { id }: ParamsId,
    @Req() request?: RequestWithUser,
  ) {
    const currentUserId = request?.user.userId ?? request?.user.id ?? id;
    if (currentUserId !== id) throw new ForbiddenException('Недостаточно прав');
    return await this.activityService.importWatchWorkouts(body.workouts, currentUserId);
  }

  @Post(id + '/watch-import/check')
  @ApiOkResponse({ type: WatchWorkoutSyncCandidatesResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Find watch workouts that are not already synchronized' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiBody({ type: WatchWorkoutSyncCandidatesRequestDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(HttpStatus.OK)
  async getWatchWorkoutSyncCandidates(
    @Body() body: WatchWorkoutSyncCandidatesRequestDto,
    @Param() { id }: ParamsId,
    @Req() request?: RequestWithUser,
  ) {
    const currentUserId = request?.user.userId ?? request?.user.id ?? id;
    if (currentUserId !== id) throw new ForbiddenException('Недостаточно прав');
    return await this.activityService.getWatchWorkoutSyncCandidates(body.workouts, currentUserId);
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

  @Get(ACTIVITY_WITH_ROUTES_ROUTE)
  @ApiOkResponse({ type: ActivitiesWithRoutesResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the authenticated user activities that have recorded routes' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor from the previous response' })
  @ApiQuery({ name: 'take', required: false, description: 'Count of results per page' })
  @ApiQuery({ name: 'search', required: false, description: 'Search activity titles and sports' })
  @ApiQuery({ name: 'month', required: false, minimum: 1, maximum: 12, description: 'Local calendar month' })
  @ApiQuery({ name: 'day', required: false, minimum: 1, maximum: 31, description: 'Local calendar day' })
  @ApiQuery({ name: 'year', required: false, minimum: 1, description: 'Local calendar year' })
  @ApiQuery({ name: 'timeZone', required: false, description: 'IANA time zone used for date filters' })
  async getActivitiesWithRoutes(
    @Req() request: RequestWithUser,
    @Query(QueryParams.cursor) cursor?: string,
    @Query(QueryParams.take) take?: string,
    @Query('search') search?: string,
    @Query('month') month?: string,
    @Query('day') day?: string,
    @Query('year') year?: string,
    @Query('timeZone') timeZone?: string,
  ) {
    const validatedTake = parsePageSizeQuery(take, QueryParams.take);
    const validatedMonth = validateOptionalIntegerQuery(month, 'month', { min: 1, max: 12 });
    const validatedDay = validateOptionalIntegerQuery(day, 'day', { min: 1, max: 31 });
    const validatedYear = validateOptionalIntegerQuery(year, 'year', { min: 1, max: 9999 });
    if (search !== undefined && search.length > 100) throw new BadRequestException('Search is too long');

    return await this.activityService.getActivitiesWithRoutes(
      getAuthenticatedUserId(request),
      validatedTake,
      parseActivityCursor(cursor),
      {
        search: search?.trim() || undefined,
        month: validatedMonth === undefined ? undefined : Number(validatedMonth),
        day: validatedDay === undefined ? undefined : Number(validatedDay),
        year: validatedYear === undefined ? undefined : Number(validatedYear),
        timeZone: validateOptionalIanaTimeZoneQuery(timeZone, 'timeZone') ?? 'UTC',
      },
    );
  }

  // Deprecated compatibility route; remove after app version 1.2.3 is released.
  @Get(ACTIVITY_FAVORITES_ROUTE)
  @ApiOkResponse({ type: ActivityListResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: ACTIVITY_FAVORITE_API_COPY.listSummary,
    description: 'Deprecated compatibility route. Remove after app version 1.2.3 is released.',
    deprecated: true,
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor from the previous response' })
  @ApiQuery({ name: 'take', required: false, description: 'Count of results per page' })
  async getFavoriteActivities(
    @Req() request: RequestWithUser,
    @Query(QueryParams.cursor) cursor?: string,
    @Query(QueryParams.take) take?: string,
  ) {
    const validatedTake = parsePageSizeQuery(take, QueryParams.take);
    return await this.activityService.getFavoriteActivities(
      getAuthenticatedUserId(request),
      validatedTake,
      parseActivityCursor(cursor),
    );
  }

  @Patch(ACTIVITY_FAVORITE_ROUTE)
  @ApiOkResponse({ description: ACTIVITY_FAVORITE_API_COPY.updateDescription })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: ACTIVITY_FAVORITE_API_COPY.updateSummary })
  @ApiBody({ type: SetActivityFavoriteDto })
  async setActivityFavorite(
    @Body() body: SetActivityFavoriteDto,
    @Param() { id }: ParamsId,
    @Req() request: RequestWithUser,
  ) {
    return await this.activityService.setActivityFavorite(id, getAuthenticatedUserId(request), body.isFavorite);
  }

  @Get(ACTIVITY_HOME_ROUTE)
  @ApiOkResponse({ type: HomeActivityFeedsResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the current user home activity feeds' })
  @ApiQuery({ name: 'take', required: false, description: 'Count of results per feed' })
  @ApiQuery({ name: 'myCursor', required: false, description: 'Cursor for the current user feed' })
  @ApiQuery({ name: 'followersCursor', required: false, description: 'Cursor for the followers feed' })
  @ApiQuery({ name: 'favoritesCursor', required: false, description: 'Cursor for the favorites feed' })
  async getHomeActivityFeeds(
    @Req() request: RequestWithUser,
    @Query(QueryParams.take) take?: string,
    @Query('myCursor') myCursor?: string,
    @Query('followersCursor') followersCursor?: string,
    @Query('favoritesCursor') favoritesCursor?: string,
  ) {
    const validatedTake = parsePageSizeQuery(take, QueryParams.take);
    const parseHomeCursor = (cursor?: string) => (cursor === 'done' ? 'done' : parseActivityCursor(cursor));
    return await this.activityService.getHomeActivityFeeds(getAuthenticatedUserId(request), validatedTake, {
      my: parseHomeCursor(myCursor),
      followers: parseHomeCursor(followersCursor),
      favorites: parseHomeCursor(favoritesCursor),
    });
  }

  // Deprecated compatibility route; remove after app version 1.2.3 is released.
  @Get(id)
  @ApiOkResponse({ type: ActivityListResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get activities by userId',
    description: 'Deprecated compatibility route. Remove after app version 1.2.3 is released.',
    deprecated: true,
  })
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
    const validatedTake = parsePageSizeQuery(take, QueryParams.take);
    return await this.activityService.getActivitesByUserId(
      id,
      validatedTake,
      parseActivityCursor(cursor),
      request?.user.userId ?? request?.user.id,
    );
  }

  // Deprecated compatibility route; remove after app version 1.2.3 is released.
  @Get(`${id}/all`)
  @ApiOkResponse({ type: ActivityListResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get activities by userId and friends ids',
    description: 'Deprecated compatibility route. Remove after app version 1.2.3 is released.',
    deprecated: true,
  })
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
    const validatedTake = parsePageSizeQuery(take, QueryParams.take);
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
  async getActivityByActivityId(@Param() { id }: ParamsId, @Req() request: RequestWithUser) {
    return await this.activityService.getActivityByActivityId(id, getAuthenticatedUserId(request));
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
