import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { AccountService } from 'src/account/account.service';
import { StorageService } from 'src/storage/services/storage.service';
import { MediaCleanupService } from 'src/storage/services/media-cleanup.service';
import { StaticMapService } from 'src/common/maps/static-map.service';
import {
  ActivityDto,
  type ActivityMediaObject,
  type WatchWorkoutImportDto,
  type LocationObject,
} from '../dto/activity.dto';
import { DEFAULT_ACTIVITY_PAGE_SIZE } from '../shared/const';
import type { ActivityCursor, ActivityMediaCursor } from '../shared/activity.pagination';
import type {
  ActivityDatabase,
  ActivityRouteWorkoutFilters,
  HomeFeedCursor,
  HomeFeedCursors,
  MigratedActivity,
} from '../shared/types';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ActivityAccessService } from './activity-access.service';
import { ActivityReadService } from './activity-read.service';
import { ActivityMediaService } from './activity-media.service';
import { ActivityWriteService } from './activity-write.service';
import { ActivityImportService } from './activity-import.service';

@Injectable()
export class ActivityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountService) private readonly accountService: AccountService,
    @Optional() @Inject(ActivityPersistenceService) persistenceService?: ActivityPersistenceService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
    @Optional() @Inject(MediaCleanupService) private readonly mediaCleanupService?: MediaCleanupService,
    @Optional() @Inject(StaticMapService) private readonly staticMapService?: StaticMapService,
    @Optional() @Inject(ActivityAccessService) activityAccessService?: ActivityAccessService,
    @Optional() @Inject(ActivityReadService) activityReadService?: ActivityReadService,
    @Optional() @Inject(ActivityMediaService) activityMediaService?: ActivityMediaService,
    @Optional() @Inject(ActivityWriteService) activityWriteService?: ActivityWriteService,
    @Optional() @Inject(ActivityImportService) activityImportService?: ActivityImportService,
  ) {
    const persistence = persistenceService ?? new ActivityPersistenceService(this.prisma);
    const access = activityAccessService ?? new ActivityAccessService(this.prisma);
    this.readService =
      activityReadService ?? new ActivityReadService(this.prisma, this.accountService, access, this.storageService);
    this.mediaService =
      activityMediaService ??
      new ActivityMediaService(this.prisma, this.storageService, this.mediaCleanupService, this.staticMapService);
    this.writeService =
      activityWriteService ??
      new ActivityWriteService(
        this.prisma,
        this.accountService,
        persistence,
        this.storageService,
        this.mediaCleanupService,
        this.staticMapService,
        this.mediaService,
      );
    this.importService =
      activityImportService ??
      new ActivityImportService(
        this.prisma,
        this.accountService,
        persistence,
        this.storageService,
        this.mediaCleanupService,
        this.staticMapService,
        this.writeService,
        this.mediaService,
      );
    this.accessService = access;
  }

  private readonly readService: ActivityReadService;
  private readonly mediaService: ActivityMediaService;
  private readonly writeService: ActivityWriteService;
  private readonly importService: ActivityImportService;
  private readonly accessService: ActivityAccessService;

  async canAccessActivity(id: string, currentUserId?: string) {
    return await this.accessService.canAccessActivity(id, currentUserId);
  }

  async canAccessActivityData(activity: { userId: string; visibility: string } | null, currentUserId?: string) {
    return await this.accessService.canAccessActivityData(activity, currentUserId);
  }

  async canInteractWithActivity(id: string, currentUserId: string) {
    return await this.accessService.canInteractWithActivity(id, currentUserId);
  }

  async getLocationsByActivityId(id: string, currentUserId?: string, raw = false) {
    return await this.readService.getLocationsByActivityId(id, currentUserId, raw);
  }

  async getChartDataByActivityId(id: string, currentUserId?: string) {
    return await this.readService.getChartDataByActivityId(id, currentUserId);
  }

  async getActivityByActivityId(id: string, currentUserId?: string) {
    return await this.readService.getActivityByActivityId(id, currentUserId);
  }

  async getMediaByUserId(id: string, take = '10', cursor?: ActivityMediaCursor, currentUserId?: string) {
    return await this.readService.getMediaByUserId(id, take, cursor, currentUserId);
  }

  async getFavoriteActivities(
    currentUserId: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
  ) {
    return await this.readService.getFavoriteActivities(currentUserId, take, cursor);
  }

  async getActivitiesWithRoutes(
    currentUserId: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
    filters: ActivityRouteWorkoutFilters = { timeZone: 'UTC' },
  ) {
    return await this.readService.getActivitiesWithRoutes(currentUserId, take, cursor, filters);
  }

  async getHomeActivityFeeds(
    currentUserId: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursors: HomeFeedCursors = {},
  ) {
    const emptyPage = { activities: [], hasMore: false, nextCursor: null, isLastPage: true };
    const readFeed = (cursor: HomeFeedCursor, read: (cursor?: ActivityCursor) => Promise<unknown>) =>
      cursor === 'done' ? Promise.resolve(emptyPage) : read(cursor);

    const [my, followers, favorites] = await Promise.all([
      readFeed(cursors.my, (cursor) => this.getActivitesByUserId(currentUserId, take, cursor, currentUserId)),
      readFeed(cursors.followers, (cursor) =>
        this.getAllActivitiesWithFriends(currentUserId, take, cursor, currentUserId),
      ),
      readFeed(cursors.favorites, (cursor) => this.getFavoriteActivities(currentUserId, take, cursor)),
    ]);

    return { my, followers, favorites };
  }
  async getActivitesByUserId(
    id: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
    currentUserId?: string,
  ) {
    return await this.readService.getActivitesByUserId(id, take, cursor, currentUserId);
  }

  async getActivitiesByTheirIds(ids?: string | string[], currentUserId?: string) {
    return await this.readService.getActivitiesByTheirIds(ids, currentUserId);
  }

  async getAllActivitiesWithFriends(
    id: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
    currentUserId = id,
  ) {
    return await this.readService.getAllActivitiesWithFriends(id, take, cursor, currentUserId);
  }

  async createActivity(activityDto: ActivityDto, id: string) {
    return await this.writeService.createActivity(activityDto, id);
  }

  async importWatchWorkouts(workouts: WatchWorkoutImportDto[], userId: string) {
    return await this.importService.importWatchWorkouts(workouts, userId);
  }

  async createActivitiesFromMigrationArchive(
    activities: Omit<MigratedActivity, 'id'>[],
    database: ActivityDatabase = this.prisma,
  ): Promise<{ success: true; importedActivities: number }> {
    return await this.importService.createActivitiesFromMigrationArchive(activities, database);
  }

  async appendActivityMedia(activityId: string, userId: string, media: ActivityMediaObject[]) {
    return await this.mediaService.appendActivityMedia(activityId, userId, media);
  }

  async deleteActivityMedia(activityId: string, mediaId: string, userId: string) {
    return await this.mediaService.deleteActivityMedia(activityId, mediaId, userId);
  }

  async uploadRawActivityLocations(id: string, currentUserId: string, locations: LocationObject[]) {
    return await this.mediaService.uploadRawActivityLocations(id, currentUserId, locations);
  }

  async updateActivity(activityDto: ActivityDto, id: string, userId = id) {
    return await this.writeService.updateActivity(activityDto, id, userId);
  }

  async setActivityFavorite(id: string, currentUserId: string, isFavorite: boolean) {
    return await this.writeService.setActivityFavorite(id, currentUserId, isFavorite);
  }

  async deleteActivityById(id: string, userId = id) {
    return await this.writeService.deleteActivityById(id, userId);
  }
}
