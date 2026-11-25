import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { AccountService } from 'src/account/account.service';
import { StorageService } from 'src/storage/services/storage.service';
import { ActivityContentReadService } from './activity-content-read.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { DEFAULT_ACTIVITY_PAGE_SIZE } from '../shared/const';
import { encodeActivityCursor, type ActivityCursor } from '../shared/activity.pagination';
import { normalizeActivityCardForViewer } from '../shared/utils';
import type { ActivityFeedSqlRow } from '../shared/types';

@Injectable()
export class ActivityFriendsFeedService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountService) private readonly accountService: AccountService,
    @Inject(ActivityContentReadService) private readonly contentService: ActivityContentReadService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
  ) {}

  resolveFeedProfilePhoto(activity: ActivityFeedSqlRow): ActivityFeedSqlRow {
    const rawProfile = activity.profile;
    if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) return activity;

    const profile = Object.fromEntries(Object.entries(rawProfile));
    const profilePhotoAssetStatus = profile.profilePhotoAssetStatus;
    const profilePhotoPublishedKey = profile.profilePhotoPublishedKey;
    delete profile.profilePhotoAssetStatus;
    delete profile.profilePhotoPublishedKey;
    if (profilePhotoAssetStatus === 'approved' && typeof profilePhotoPublishedKey === 'string' && this.storageService) {
      profile.profilePhoto = this.storageService.getPublicUrl(profilePhotoPublishedKey);
    }

    return { ...activity, profile };
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
            a."source_app_name" AS "sourceAppName",
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
        nextCursor: hasMore && activities.length ? encodeActivityCursor(activities.at(-1)!) : null,
        isLastPage: !hasMore,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }
}
