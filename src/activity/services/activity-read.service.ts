import { Inject, Injectable } from '@nestjs/common';
import { ActivityContentReadService } from './activity-content-read.service';
import { ActivityFeedService } from './activity-feed.service';
import { ActivityRouteFeedService } from './activity-route-feed.service';
import { ActivityFriendsFeedService } from './activity-friends-feed.service';
import type { ActivityCursor, ActivityMediaCursor } from '../shared/activity.pagination';
import type { ActivityRouteWorkoutFilters } from '../shared/types';
import { DEFAULT_ACTIVITY_PAGE_SIZE } from '../shared/const';

@Injectable()
export class ActivityReadService {
  constructor(
    @Inject(ActivityContentReadService) private readonly contentService: ActivityContentReadService,
    @Inject(ActivityFeedService) private readonly feedService: ActivityFeedService,
    @Inject(ActivityRouteFeedService) private readonly routeFeedService: ActivityRouteFeedService,
    @Inject(ActivityFriendsFeedService) private readonly friendsFeedService: ActivityFriendsFeedService,
  ) {}

  async getLocationsByActivityId(id: string, currentUserId?: string, raw = false) {
    return await this.contentService.getLocationsByActivityId(id, currentUserId, raw);
  }

  async getChartDataByActivityId(id: string, currentUserId?: string) {
    return await this.contentService.getChartDataByActivityId(id, currentUserId);
  }

  async getActivityByActivityId(id: string, currentUserId?: string) {
    return await this.contentService.getActivityByActivityId(id, currentUserId);
  }

  async getMediaByUserId(id: string, take = '10', cursor?: ActivityMediaCursor, currentUserId?: string) {
    return await this.contentService.getMediaByUserId(id, take, cursor, currentUserId);
  }

  async getFavoriteActivities(
    currentUserId: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
  ) {
    return await this.feedService.getFavoriteActivities(currentUserId, take, cursor);
  }

  async getActivitiesWithRoutes(
    currentUserId: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor: ActivityCursor | undefined,
    filters: ActivityRouteWorkoutFilters,
  ) {
    return await this.routeFeedService.getActivitiesWithRoutes(currentUserId, take, cursor, filters);
  }

  async getActivitesByUserId(
    id: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
    currentUserId?: string,
  ) {
    return await this.feedService.getActivitesByUserId(id, take, cursor, currentUserId);
  }

  async getActivitiesByTheirIds(ids?: string | string[], currentUserId?: string) {
    return await this.feedService.getActivitiesByTheirIds(ids, currentUserId);
  }

  async getAllActivitiesWithFriends(
    id: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
    currentUserId = id,
  ) {
    return await this.friendsFeedService.getAllActivitiesWithFriends(id, take, cursor, currentUserId);
  }
}
