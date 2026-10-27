import { Inject, Injectable, Optional } from '@nestjs/common';
import { AccountService } from 'src/account/account.service';
import { reduceLocations } from 'src/common/parsers/reduce-locations';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { ActivityAccessService } from './activity-access.service';
import type { ActivityHeartRateSampleObject, LocationObject } from '../activity.dto';
import {
  ACTIVITY_CARD_SELECT,
  ACTIVITY_DETAILS_SELECT,
  DEFAULT_ACTIVITY_PAGE_SIZE,
  MAX_MAP_ROUTE_LOCATIONS,
} from '../const';
import {
  encodeActivityCursor,
  encodeActivityMediaCursor,
  type ActivityCursor,
  type ActivityMediaCursor,
} from '../activity.pagination';
import { ACTIVITY_VISIBILITY } from '../activity-visibility';
import {
  createActivityChartLocations,
  hidePendingActivityMediaForViewer,
  hideActivityMapForViewer,
  normalizeActivityCardForViewer,
  normalizeActivityDetails,
  reduceActivityChartHeartRateSamples,
} from '../utils';
import type { ActivityFeedSqlRow } from '../type';

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
        moderationStatus: true,
        hideMap: true,
        profile: { select: { allowActivityReplayViewing: true } },
      },
    });
    if (!activity || !currentUserId) return null;

    // The activity row already contains the fields required for the common
    // owner/public checks. Avoid fetching the same row a second time; only
    // follower-only activities need the additional relationship lookup.
    if (!(await this.accessService.canAccessActivityData(activity, currentUserId))) return null;
    const isOwner = activity.userId === currentUserId;
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
        heartRateStorageKey: true,
        routeStorageKey: true,
        distance: true,
        userId: true,
        visibility: true,
        moderationStatus: true,
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

    if (!(await this.accessService.canAccessActivityData(activity, currentUserId))) return null;
    const isOwner = activity.userId === currentUserId;
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

    let heartRateSamples: ActivityHeartRateSampleObject[] = [];
    if (canViewHeartRate && activity.heartRateStorageKey) {
      if (!this.storageService) throw new Error('Сервис хранения данных пульса не настроен');
      heartRateSamples = reduceActivityChartHeartRateSamples(
        await this.storageService.readActivityHeartRateSamples(activity.heartRateStorageKey),
        locations,
      );
    }
    return { heartRateSamples, locations };
  }

  async getActivityByActivityId(id: string, currentUserId?: string) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id },
        select: ACTIVITY_DETAILS_SELECT,
      });
      if (
        !activity ||
        activity.moderationStatus !== 'visible' ||
        !(await this.accessService.canAccessActivityData(activity, currentUserId))
      )
        return null;
      const activityWithOwnerPreviews = await this.resolveActivityMediaForViewer({ ...activity }, currentUserId);
      const activityForResponse = hidePendingActivityMediaForViewer(activityWithOwnerPreviews, currentUserId);
      delete activityForResponse.moderationStatus;
      const normalizedActivity = hideActivityMapForViewer(
        normalizeActivityDetails(activityForResponse as Record<string, unknown>),
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
          moderationStatus: 'visible',
          ...(Object.keys(visibilityFilter).length
            ? { activity: { ...visibilityFilter, moderationStatus: 'visible' } }
            : { activity: { moderationStatus: 'visible' } }),
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
          mediaReviewStatus: true,
          mediaModerationAssetId: true,
          thumbnailModerationAssetId: true,
        },
      });
      const hasMore = media.length > pageSize;
      const slicedMedia = media.slice(0, pageSize) as Array<{
        id: string;
        activityDate: Date;
        activityId: string;
        position: number;
        url: string | null;
        thumbnail: string | null;
        blurhash: string | null;
        mediaReviewStatus: string | null;
        mediaModerationAssetId: string | null;
        thumbnailModerationAssetId: string | null;
      }>;
      const lastMedia = slicedMedia.at(-1);
      const mediaForResponse = await this.resolveMediaForViewer(
        slicedMedia.map(
          ({
            id: mediaId,
            activityId,
            url,
            thumbnail,
            blurhash,
            mediaReviewStatus,
            mediaModerationAssetId,
            thumbnailModerationAssetId,
          }) => ({
            id: mediaId,
            activityId,
            url,
            thumbnail,
            blurhash,
            mediaReviewStatus,
            mediaModerationAssetId,
            thumbnailModerationAssetId,
          }),
        ),
        id,
        currentUserId,
      );
      return {
        media: mediaForResponse,
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

  private async resolveActivityMediaForViewer<T extends Record<string, unknown>>(activity: T, viewerId?: string) {
    if (!Array.isArray(activity.media)) return activity;
    const ownerId = typeof activity.userId === 'string' ? activity.userId : '';
    return {
      ...activity,
      media: await this.resolveMediaForViewer(activity.media, ownerId, viewerId),
    } as T;
  }

  private async resolveMediaForViewer(mediaItems: unknown[], ownerId: string, viewerId?: string) {
    const isOwner = Boolean(ownerId && viewerId === ownerId);
    const ownerAssetIds = mediaItems.flatMap((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
      const media = item as Record<string, unknown>;
      return [media.mediaModerationAssetId, media.thumbnailModerationAssetId].filter(
        (assetId): assetId is string => typeof assetId === 'string',
      );
    });
    const ownerPreviewUrls =
      isOwner && viewerId && this.storageService && ownerAssetIds.length
        ? await this.storageService.getOwnerModerationPreviewUrls(viewerId, ownerAssetIds)
        : {};
    const resolvedMedia = await Promise.all(
      mediaItems.map(async (item) => {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
        const media = { ...(item as Record<string, unknown>) };
        const mediaAssetId = typeof media.mediaModerationAssetId === 'string' ? media.mediaModerationAssetId : null;
        const thumbnailAssetId =
          typeof media.thumbnailModerationAssetId === 'string' ? media.thumbnailModerationAssetId : null;
        delete media.mediaModerationAssetId;
        delete media.thumbnailModerationAssetId;

        if (!isOwner) {
          const isApproved = media.mediaReviewStatus === 'approved';
          const isLegacyPublicMedia =
            !mediaAssetId &&
            (media.mediaReviewStatus === null || media.mediaReviewStatus === undefined) &&
            typeof media.url === 'string';
          if (!isApproved && !isLegacyPublicMedia) {
            if (media.mediaReviewStatus === 'rejected' || media.mediaReviewStatus === 'failed') return null;
            if (typeof media.mediaReviewStatus !== 'string') return null;
            return { ...media, url: null, thumbnail: null };
          }
          return media;
        }

        const previewUrl =
          typeof media.url === 'string' ? media.url : mediaAssetId ? ownerPreviewUrls[mediaAssetId] : null;
        const previewThumbnail =
          typeof media.thumbnail === 'string'
            ? media.thumbnail
            : thumbnailAssetId
              ? ownerPreviewUrls[thumbnailAssetId]
              : null;
        return {
          ...media,
          ...(previewUrl ? { url: previewUrl } : {}),
          ...(previewThumbnail ? { thumbnail: previewThumbnail } : {}),
        };
      }),
    );
    return resolvedMedia.filter((media): media is Record<string, unknown> => media !== null);
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
              await this.resolveActivityMediaForViewer(activity, currentUserId),
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
              await this.resolveActivityMediaForViewer(activity, currentUserId),
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
            await this.resolveActivityMediaForViewer(activity, currentUserId),
            currentUserId,
          ),
        ),
      );
    } catch (error) {
      handleServiceError(error);
    }
  }

  private resolveFeedProfilePhoto<T extends ActivityFeedSqlRow>(activity: T): T {
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
              await this.resolveActivityMediaForViewer(this.resolveFeedProfilePhoto(activity), currentUserId),
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
