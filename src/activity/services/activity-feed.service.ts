import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { AccountService } from 'src/account/account.service';
import { StorageService } from 'src/storage/services/storage.service';
import { ActivityAccessService } from './activity-access.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { ACTIVITY_CARD_SELECT, DEFAULT_ACTIVITY_PAGE_SIZE } from '../shared/const';
import { encodeActivityCursor, type ActivityCursor } from '../shared/activity.pagination';
import { ACTIVITY_VISIBILITY } from '../shared/activity-visibility';
import { normalizeActivityCardForViewer } from '../shared/utils';
import type { ActivityFeedSqlRow, ActivityRouteWorkoutFilters } from '../shared/types';
import { ActivityContentReadService } from './activity-content-read.service';

@Injectable()
export class ActivityFeedService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountService) private readonly accountService: AccountService,
    @Inject(ActivityAccessService) private readonly accessService: ActivityAccessService,
    @Inject(ActivityContentReadService) private readonly contentService: ActivityContentReadService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
  ) {}

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
          moderationStatus: 'visible',
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
      const activities = await Promise.all(
        activitiesWithExtraItem
          .slice(0, Number(take))
          .map(async (activity: Record<string, unknown>) =>
            normalizeActivityCardForViewer(
              await this.contentService.resolveActivityMediaForViewer(activity, currentUserId),
              currentUserId,
            ),
          ),
      );
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

  async getActivitiesWithRoutes(
    currentUserId: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor: ActivityCursor | undefined,
    filters: ActivityRouteWorkoutFilters,
  ) {
    try {
      const pageSize = Number(take);
      const routeDateRows = await this.prisma.$queryRaw<Array<{ year: number; month: number; day: number }>>`
          SELECT DISTINCT
            EXTRACT(YEAR FROM ("date" AT TIME ZONE ${filters.timeZone}))::int AS "year",
            EXTRACT(MONTH FROM ("date" AT TIME ZONE ${filters.timeZone}))::int AS "month",
            EXTRACT(DAY FROM ("date" AT TIME ZONE ${filters.timeZone}))::int AS "day"
          FROM "Activity"
          WHERE "user_id" = ${currentUserId}::uuid
            AND "moderation_status" = 'visible'
            AND "route_storage_key" IS NOT NULL
            AND "route_point_count" > 1
            AND (${filters.search === undefined} OR COALESCE("title", '') ILIKE ${`%${filters.search ?? ''}%`} OR "sport" ILIKE ${`%${filters.search ?? ''}%`})
        `;
      const availableFilters = {
        years: [
          ...new Set(
            routeDateRows
              .filter(
                ({ month, day }) =>
                  (filters.month === undefined || month === filters.month) &&
                  (filters.day === undefined || day === filters.day),
              )
              .map(({ year }) => year),
          ),
        ].sort((first, second) => second - first),
        months: [
          ...new Set(
            routeDateRows
              .filter(
                ({ year, day }) =>
                  (filters.year === undefined || year === filters.year) &&
                  (filters.day === undefined || day === filters.day),
              )
              .map(({ month }) => month),
          ),
        ].sort((first, second) => first - second),
        days: [
          ...new Set(
            routeDateRows
              .filter(
                ({ year, month }) =>
                  (filters.year === undefined || year === filters.year) &&
                  (filters.month === undefined || month === filters.month),
              )
              .map(({ day }) => day),
          ),
        ].sort((first, second) => first - second),
      };
      const dateFilterIds =
        filters.month !== undefined || filters.day !== undefined || filters.year !== undefined
          ? await this.prisma.$queryRaw<Array<{ id: string }>>`
              SELECT "id"
              FROM "Activity"
              WHERE "user_id" = ${currentUserId}::uuid
                AND "moderation_status" = 'visible'
                AND "route_storage_key" IS NOT NULL
                AND "route_point_count" > 1
                AND (${filters.year === undefined} OR EXTRACT(YEAR FROM ("date" AT TIME ZONE ${filters.timeZone})) = ${filters.year ?? 0})
                AND (${filters.month === undefined} OR EXTRACT(MONTH FROM ("date" AT TIME ZONE ${filters.timeZone})) = ${filters.month ?? 0})
                AND (${filters.day === undefined} OR EXTRACT(DAY FROM ("date" AT TIME ZONE ${filters.timeZone})) = ${filters.day ?? 0})
            `
          : undefined;
      const activitiesWithExtraItem = await this.prisma.activity.findMany({
        where: {
          userId: currentUserId,
          moderationStatus: 'visible',
          routeStorageKey: { not: null },
          routePointCount: { gt: 1 },
          AND: [
            ...(filters.search
              ? [
                  {
                    OR: [
                      { title: { contains: filters.search, mode: 'insensitive' as const } },
                      { sport: { contains: filters.search, mode: 'insensitive' as const } },
                    ],
                  },
                ]
              : []),
            ...(dateFilterIds ? [{ id: { in: dateFilterIds.map(({ id }) => id) } }] : []),
            ...(cursor
              ? [
                  {
                    OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
        select: { ...ACTIVITY_CARD_SELECT, routePointCount: true },
      });
      const hasMore = activitiesWithExtraItem.length > pageSize;
      const activities = await Promise.all(
        activitiesWithExtraItem
          .slice(0, pageSize)
          .map(async (activity: Record<string, unknown>) =>
            normalizeActivityCardForViewer(
              await this.contentService.resolveActivityMediaForViewer(activity, currentUserId),
              currentUserId,
            ),
          ),
      );
      return {
        activities,
        hasMore,
        nextCursor: hasMore && activities.length ? encodeActivityCursor(activities.at(-1)!) : null,
        isLastPage: !hasMore,
        availableFilters,
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
          moderationStatus: 'visible',
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
      const activities = await Promise.all(
        activitiesWithExtraItem
          .slice(0, Number(take))
          .map(async (activity: Record<string, unknown>) =>
            normalizeActivityCardForViewer(
              await this.contentService.resolveActivityMediaForViewer(activity, currentUserId),
              currentUserId,
            ),
          ),
      );
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
      const blockedUserIds = currentUserId ? await this.accessService.getBlockedUserIds(currentUserId) : [];
      const followedUsers = currentUserId
        ? await this.prisma.friend.findMany({ where: { userId: currentUserId }, select: { friendId: true } })
        : [];
      const followedUserIds = followedUsers.map((friend: { friendId: string }) => friend.friendId);
      const activities = await this.prisma.activity.findMany({
        where: {
          id: searchByStringOrArray,
          moderationStatus: 'visible',
          ...(blockedUserIds.length ? { userId: { notIn: blockedUserIds } } : {}),
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
      return await Promise.all(
        activities.map(async (activity: Record<string, unknown>) =>
          normalizeActivityCardForViewer(
            await this.contentService.resolveActivityMediaForViewer(activity, currentUserId),
            currentUserId,
          ),
        ),
      );
    } catch (error) {
      handleServiceError(error);
    }
  }

  resolveFeedProfilePhoto<T extends ActivityFeedSqlRow>(activity: T): T {
    const rawProfile = activity.profile;
    if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) return activity;

    const { profilePhotoAssetStatus, profilePhotoPublishedKey, ...profile } = rawProfile as Record<string, unknown>;
    if (profilePhotoAssetStatus === 'approved' && typeof profilePhotoPublishedKey === 'string' && this.storageService) {
      profile.profilePhoto = this.storageService.getPublicUrl(profilePhotoPublishedKey);
    }

    return { ...activity, profile } as T;
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
                    'blurhash', am."blurhash",
                    'mediaReviewStatus', am."media_review_status",
                    'mediaModerationAssetId', am."media_moderation_asset_id",
                    'thumbnailModerationAssetId', am."thumbnail_moderation_asset_id"
                  )
                  ORDER BY am."position" ASC
                )
                FROM "ActivityMedia" AS am
                WHERE am."activity_id" = a."id"
                  AND am."moderation_status" = 'visible'
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
              'profilePhotoBlurhash', CASE
                WHEN p."user_id" <> ${currentUserId}::uuid
                  AND profile_photo_asset."status" = 'approved'
                  AND profile_photo_asset."published_key" IS NOT NULL
                  THEN p."profile_photo_pending_blurhash"
                WHEN p."user_id" <> ${currentUserId}::uuid
                  AND profile_photo_asset."status" IN ('queued', 'processing', 'review_required')
                  AND p."profilePhoto" IS NULL
                  THEN p."profile_photo_pending_blurhash"
                ELSE p."profilePhotoBlurhash"
              END,
              'profilePhotoReviewStatus', CASE
                WHEN p."user_id" <> ${currentUserId}::uuid
                  AND profile_photo_asset."status" IN ('queued', 'processing', 'review_required')
                  AND p."profilePhoto" IS NULL
                  THEN profile_photo_asset."status"
                ELSE NULL
              END,
              'profilePhotoAssetStatus', CASE
                WHEN p."user_id" <> ${currentUserId}::uuid THEN profile_photo_asset."status"
                ELSE NULL
              END,
              'profilePhotoPublishedKey', CASE
                WHEN p."user_id" <> ${currentUserId}::uuid THEN profile_photo_asset."published_key"
                ELSE NULL
              END,
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
                  AND c."moderation_status" = 'visible'
                  AND NOT EXISTS (
                    SELECT 1 FROM "UserBlock" AS cb
                    WHERE (cb."blocker_id" = ${currentUserId}::uuid AND cb."blocked_id"::text = c."authorId")
                       OR (cb."blocked_id" = ${currentUserId}::uuid AND cb."blocker_id"::text = c."authorId")
                  )
              ),
              'likes', (
                SELECT COUNT(*)::int
                FROM "Like" AS l
                WHERE l."activityId" = a."id"
              )
            ) AS "_count"
          FROM "Activity" AS a
          INNER JOIN "Profile" AS p ON p."id" = a."profileId"
          LEFT JOIN "MediaModerationAsset" AS profile_photo_asset
            ON profile_photo_asset."id"::text = p."profile_photo_pending_asset_id"
            AND profile_photo_asset."owner_id" = p."user_id"
            AND profile_photo_asset."role" = 'media'
            AND profile_photo_asset."scope" = 'profile'
            AND profile_photo_asset."status" IN ('queued', 'processing', 'review_required', 'approved')
          WHERE a."visibility" IN ('public', 'followers')
            AND a."moderation_status" = 'visible'
            AND NOT EXISTS (
              SELECT 1 FROM "UserBlock" AS ab
              WHERE (ab."blocker_id" = ${currentUserId}::uuid AND ab."blocked_id" = a."user_id")
                 OR (ab."blocked_id" = ${currentUserId}::uuid AND ab."blocker_id" = a."user_id")
            )
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
      const activities = await Promise.all(
        activitiesWithExtraItem
          .slice(0, Number(take))
          .map(async (activity: ActivityFeedSqlRow) =>
            normalizeActivityCardForViewer(
              await this.contentService.resolveActivityMediaForViewer(
                this.resolveFeedProfilePhoto(activity),
                currentUserId,
              ),
              currentUserId,
            ),
          ),
      );
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
