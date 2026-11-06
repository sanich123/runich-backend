import { Inject, Injectable, Optional } from '@nestjs/common';
import { AccountService } from 'src/account/account.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { ActivityAccessService } from './activity-access.service';
import { ActivityContentReadService } from './activity-content-read.service';
import { ActivityFeedService } from './activity-feed.service';
import type { ActivityCursor, ActivityMediaCursor } from '../shared/activity.pagination';
import type { ActivityRouteWorkoutFilters } from '../shared/types';
import { DEFAULT_ACTIVITY_PAGE_SIZE } from '../shared/const';

@Injectable()
export class ActivityReadService {
  private readonly contentService: ActivityContentReadService;
  private readonly feedService: ActivityFeedService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(AccountService) accountService: AccountService,
    @Inject(ActivityAccessService) accessService: ActivityAccessService,
    @Optional() @Inject(StorageService) storageService?: StorageService,
    @Optional() @Inject(ActivityContentReadService) contentService?: ActivityContentReadService,
    @Optional() @Inject(ActivityFeedService) feedService?: ActivityFeedService,
  ) {
    this.contentService = contentService ?? new ActivityContentReadService(prisma, accessService, storageService);
    this.feedService =
      feedService ??
      new ActivityFeedService(prisma, accountService, accessService, this.contentService, storageService);
  }

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
    return await this.feedService.getActivitiesWithRoutes(currentUserId, take, cursor, filters);
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
    return await this.feedService.getAllActivitiesWithFriends(id, take, cursor, currentUserId);
  }
}
