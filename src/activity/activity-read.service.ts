import { Inject, Injectable, Optional } from '@nestjs/common';
import { AccountService } from 'src/account/account.service';
import { reduceLocations } from 'src/common/parsers/reduce-locations';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/storage.service';
import { ActivityAccessService } from './activity-access.service';
import type { ActivityHeartRateSampleObject, LocationObject } from './activity.dto';
import {
  ACTIVITY_CARD_SELECT,
  ACTIVITY_DETAILS_SELECT,
  DEFAULT_ACTIVITY_PAGE_SIZE,
  MAX_MAP_ROUTE_LOCATIONS,
} from './const';
import {
  encodeActivityCursor,
  encodeActivityMediaCursor,
  type ActivityCursor,
  type ActivityMediaCursor,
} from './activity.pagination';
import { ACTIVITY_VISIBILITY } from './activity-visibility';
import {
  createActivityChartLocations,
  hideActivityMapForViewer,
  normalizeActivityCardForViewer,
  normalizeActivityDetails,
} from './utils';
import type { ActivityFeedSqlRow } from './type';

@Injectable()
export class ActivityReadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountService) private readonly accountService: AccountService,
    @Inject(ActivityAccessService) private readonly accessService: ActivityAccessService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
  ) {}

  async getLocationsByActivityId(id: string, currentUserId?: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: {
        routeStorageKey: true,
        kilometresSplit: true,
        userId: true,
        visibility: true,
        hideMap: true,
        profile: { select: { allowActivityReplayViewing: true } },
      },
    });
    if (!activity || !currentUserId) return null;

    // The activity row already contains the fields required for the common
    // owner/public checks. Avoid fetching the same row a second time; only
    // follower-only activities need the additional relationship lookup.
    const isOwner = activity.userId === currentUserId;
    const isPublic = activity.visibility === ACTIVITY_VISIBILITY.public;
    const isFollowerActivity =
      activity.visibility === ACTIVITY_VISIBILITY.followers &&
      (isOwner || (await this.accessService.isFollower(currentUserId, activity.userId)));
    if (!isOwner && !isPublic && !isFollowerActivity) return null;
    if (!isOwner && activity.hideMap) return null;
    if (!isOwner && activity.profile?.allowActivityReplayViewing === false) return null;
    let locations: LocationObject[] | undefined;
    if (activity.routeStorageKey) {
      if (!this.storageService) throw new Error('Сервис хранения маршрутов не настроен');
      locations = reduceLocations(
        await this.storageService.readActivityRoute(activity.routeStorageKey),
        MAX_MAP_ROUTE_LOCATIONS,
      );
    }
    return { locations, kilometresSplit: activity.kilometresSplit };
  }

  async getChartDataByActivityId(id: string, currentUserId?: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: {
        heartRateSamples: true,
        routeStorageKey: true,
        distance: true,
        userId: true,
        visibility: true,
        profile: {
          select: {
            allowActivityHeartRateViewing: true,
            allowActivityElevationViewing: true,
            allowActivityPaceViewing: true,
          },
        },
      },
    });
    if (!activity || !currentUserId) return null;

    const isOwner = activity.userId === currentUserId;
    const isPublic = activity.visibility === ACTIVITY_VISIBILITY.public;
    const isFollowerActivity =
      activity.visibility === ACTIVITY_VISIBILITY.followers &&
      (isOwner || (await this.accessService.isFollower(currentUserId, activity.userId)));
    if (!isOwner && !isPublic && !isFollowerActivity) return null;
    const canViewHeartRate = isOwner || activity.profile?.allowActivityHeartRateViewing !== false;
    const canViewElevation = isOwner || activity.profile?.allowActivityElevationViewing !== false;
    const canViewPace = isOwner || activity.profile?.allowActivityPaceViewing !== false;
    const hasEnoughVisibleMetrics = [canViewHeartRate, canViewElevation, canViewPace].filter(Boolean).length >= 2;
    if (!hasEnoughVisibleMetrics) return { heartRateSamples: [], locations: null };

    let locations: ReturnType<typeof createActivityChartLocations> | null = null;
    if (activity.routeStorageKey && (canViewPace || canViewElevation)) {
      if (!this.storageService) throw new Error('Сервис хранения маршрутов не настроен');
      const route = reduceLocations(
        await this.storageService.readActivityRoute(activity.routeStorageKey),
        MAX_MAP_ROUTE_LOCATIONS,
      );
      locations = createActivityChartLocations(route, activity.distance, canViewPace, canViewElevation);
    }

    const heartRateSamples =
      canViewHeartRate && Array.isArray(activity.heartRateSamples)
        ? (activity.heartRateSamples as ActivityHeartRateSampleObject[])
        : [];
    return { heartRateSamples, locations };
  }

  async getActivityByActivityId(id: string, currentUserId?: string) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id },
        select: ACTIVITY_DETAILS_SELECT,
      });
      if (!activity || !(await this.accessService.canAccessActivityData(activity, currentUserId))) return null;
      const normalizedActivity = hideActivityMapForViewer(
        normalizeActivityDetails(activity as Record<string, unknown>),
        currentUserId,
      );
      const isOwner = Boolean(currentUserId && activity.userId === currentUserId);
      const canViewHeartRate = isOwner || activity.profile?.allowActivityHeartRateViewing !== false;
      const canViewElevation = isOwner || activity.profile?.allowActivityElevationViewing !== false;
      return {
        ...normalizedActivity,
        ...(canViewHeartRate
          ? {}
          : {
              averageHeartRate: null,
              minHeartRate: null,
              maxHeartRate: null,
              profile: activity.profile
                ? { ...activity.profile, age: null, restingHeartRate: null, maxHeartRate: null }
                : normalizedActivity.profile,
            }),
        ...(canViewElevation ? {} : { elevationGain: null }),
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getMediaByUserId(id: string, take = '10', cursor?: ActivityMediaCursor, currentUserId?: string) {
    try {
      const pageSize = Number(take);
      if (currentUserId && currentUserId !== id) {
        const profile = await this.prisma.profile.findUnique({
          where: { userId: id },
          select: { hideProfilePhotos: true },
        });
        if (profile?.hideProfilePhotos) {
          return { media: [], hasMore: false, nextCursor: null, isLastPage: true };
        }
      }
      const visibilityFilter = await this.accessService.getVisibilityFilter(id, currentUserId);
      const media = await this.prisma.activityMedia.findMany({
        where: {
          userId: id,
          ...(Object.keys(visibilityFilter).length ? { activity: visibilityFilter } : {}),
          ...(cursor
            ? {
                OR: [
                  { activityDate: { lt: cursor.date } },
                  { activityDate: cursor.date, activityId: { lt: cursor.id } },
                  { activityDate: cursor.date, activityId: cursor.id, position: { gt: cursor.photoIndex } },
                ],
              }
            : {}),
        },
        orderBy: [{ activityDate: 'desc' }, { activityId: 'desc' }, { position: 'asc' }],
        take: pageSize + 1,
        select: {
          activityDate: true,
          activityId: true,
          position: true,
          id: true,
          url: true,
          thumbnail: true,
          blurhash: true,
        },
      });
      const hasMore = media.length > pageSize;
      const slicedMedia = media.slice(0, pageSize) as Array<{
        id: string;
        activityDate: Date;
        activityId: string;
        position: number;
        url: string;
        thumbnail: string | null;
        blurhash: string | null;
      }>;
      const lastMedia = slicedMedia.at(-1);
      return {
        media: slicedMedia.map(({ id: mediaId, activityId, url, thumbnail, blurhash }) => ({
          id: mediaId,
          activityId,
          url,
          thumbnail,
          blurhash,
        })),
        hasMore,
        nextCursor:
          hasMore && lastMedia
            ? encodeActivityMediaCursor({
                date: lastMedia.activityDate,
                id: lastMedia.activityId,
                photoIndex: lastMedia.position,
              })
            : null,
        isLastPage: !hasMore,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getFavoriteActivities(
    currentUserId: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
  ) {
    try {
      const activitiesWithExtraItem = await this.prisma.activity.findMany({
        where: {
          userId: currentUserId,
          isFavorite: true,
          ...(cursor
            ? {
                OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
              }
            : {}),
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: Number(take) + 1,
        select: ACTIVITY_CARD_SELECT,
      });
      const hasMore = activitiesWithExtraItem.length > Number(take);
      const activities = activitiesWithExtraItem
        .slice(0, Number(take))
        .map((activity: Record<string, unknown>) => normalizeActivityCardForViewer(activity, currentUserId));
      return {
        activities,
        hasMore,
        nextCursor: hasMore && activities.length ? encodeActivityCursor(activities.at(-1)!) : null,
        isLastPage: !hasMore,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getActivitesByUserId(
    id: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
    currentUserId?: string,
  ) {
    try {
      const visibilityFilter = await this.accessService.getVisibilityFilter(id, currentUserId);
      const activitiesWithExtraItem = await this.prisma.activity.findMany({
        where: {
          userId: id,
          ...visibilityFilter,
          ...(cursor
            ? {
                OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
              }
            : {}),
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: Number(take) + 1,
        select: ACTIVITY_CARD_SELECT,
      });
      const hasMore = activitiesWithExtraItem.length > Number(take);
      const activities = activitiesWithExtraItem
        .slice(0, Number(take))
        .map((activity: Record<string, unknown>) => normalizeActivityCardForViewer(activity, currentUserId));
      return {
        activities,
        hasMore,
        nextCursor: hasMore && activities.length ? encodeActivityCursor(activities.at(-1)!) : null,
        isLastPage: !hasMore,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getActivitiesByTheirIds(ids?: string | string[], currentUserId?: string) {
    const normalizedIds = (Array.isArray(ids) ? ids : [ids ?? ''])
      .flatMap((activityId) => activityId.split(','))
      .map((activityId) => activityId.trim())
      .filter(Boolean);
    if (!normalizedIds.length) return [];

    const searchByStringOrArray = normalizedIds.length === 1 ? normalizedIds[0] : { in: normalizedIds };
    try {
      const followedUsers = currentUserId
        ? await this.prisma.friend.findMany({ where: { userId: currentUserId }, select: { friendId: true } })
        : [];
      const followedUserIds = followedUsers.map((friend: { friendId: string }) => friend.friendId);
      const activities = await this.prisma.activity.findMany({
        where: {
          id: searchByStringOrArray,
          OR: [
            ...(currentUserId ? [{ userId: currentUserId }] : []),
            { visibility: ACTIVITY_VISIBILITY.public },
            ...(followedUserIds.length
              ? [{ userId: { in: followedUserIds }, visibility: ACTIVITY_VISIBILITY.followers }]
              : []),
          ],
        },
        orderBy: { date: 'desc' },
        select: ACTIVITY_CARD_SELECT,
      });
      return activities.map((activity: Record<string, unknown>) =>
        normalizeActivityCardForViewer(activity, currentUserId),
      );
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getAllActivitiesWithFriends(
    id: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
    currentUserId = id,
  ) {
    try {
      const activitiesWithExtraItem = await this.prisma.$queryRaw<ActivityFeedSqlRow[]>`
        SELECT
          a."title",
          a."date",
          a."sport",
          a."emotion",
          a."id",
          a."user_id" AS "userId",
          a."visibility",
          a."hide_map" AS "hideMap",
          a."is_favorite" AS "isFavorite",
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', am."id",
                  'url', am."url",
                  'thumbnail', am."thumbnail",
                  'blurhash', am."blurhash"
                )
                ORDER BY am."position" ASC
              )
              FROM "ActivityMedia" AS am
              WHERE am."activity_id" = a."id"
            ),
            '[]'::json
              ) AS "media",
          a."mapPhotoUrl",
          a."route_only_map_photo_url" AS "routeOnlyMapPhotoUrl",
          a."mapPhotoUrlBlurhash",
          a."location_name" AS "locationName",
          a."weather_temperature" AS "weatherTemperature",
          a."weather_wind_speed" AS "weatherWindSpeed",
          a."weather_code" AS "weatherCode",
          a."calories_active" AS "caloriesActive",
          a."duration",
          a."distance",
          a."steps",
          a."elevationGain",
          a."kilometresSplit",
          json_build_object(
            'userId', p."user_id",
            'surname', p."surname",
            'name', p."name",
            'profilePhoto', p."profilePhoto",
            'profilePhotoBlurhash', p."profilePhotoBlurhash",
            'allowActivityInteractions', p."allow_activity_interactions",
            'allowActivityReplayViewing', p."allow_activity_replay_viewing",
            'allowActivityHeartRateViewing', p."allow_activity_heart_rate_viewing",
            'allowActivityElevationViewing', p."allow_activity_elevation_viewing",
            'allowActivityPaceViewing', p."allow_activity_pace_viewing",
            'allowActivitySharing', p."allow_activity_sharing"
          ) AS "profile",
          json_build_object(
            'comments', (
              SELECT COUNT(*)::int
              FROM "Comment" AS c
              WHERE c."activityId" = a."id"
            ),
            'likes', (
              SELECT COUNT(*)::int
              FROM "Like" AS l
              WHERE l."activityId" = a."id"
            )
          ) AS "_count"
        FROM "Activity" AS a
        INNER JOIN "Profile" AS p ON p."id" = a."profileId"
        WHERE a."visibility" IN ('public', 'followers')
          AND (
            a."user_id" = ${currentUserId}::uuid
            OR EXISTS (
              SELECT 1
              FROM "Friend" AS f
              WHERE f."user_id" = ${currentUserId}::uuid
                AND f."friendId" = a."user_id"
            )
          )
          AND (
            ${cursor === undefined}
            OR a."date" < ${cursor?.date ?? null}
            OR (
              a."date" = ${cursor?.date ?? null}
              AND a."id" < ${cursor?.id ?? null}::uuid
            )
          )
        ORDER BY a."date" DESC, a."id" DESC
        LIMIT ${Number(take) + 1}::int
      `;
      const hasMore = activitiesWithExtraItem.length > Number(take);
      const activities = activitiesWithExtraItem
        .slice(0, Number(take))
        .map((activity: ActivityFeedSqlRow) => normalizeActivityCardForViewer(activity, currentUserId));
      const currentUserProfile =
        typeof this.accountService.getAccountByUserId === 'function'
          ? await this.accountService.getAccountByUserId(currentUserId)
          : undefined;
      return {
        activities,
        ...(currentUserProfile
          ? {
              currentUserProfile: {
                userId: currentUserProfile.userId,
                surname: currentUserProfile.surname,
                name: currentUserProfile.name,
                profilePhoto: currentUserProfile.profilePhoto,
                profilePhotoBlurhash: currentUserProfile.profilePhotoBlurhash,
              },
            }
          : {}),
        hasMore,
        nextCursor:
          hasMore && activities.length ? encodeActivityCursor(activities.at(-1)! as unknown as ActivityCursor) : null,
        isLastPage: !hasMore,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }
}
