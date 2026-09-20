/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ActivityDto, type LocationObject } from './activity.dto';
import { handleServiceError } from 'src/common/utils/database-errors';
import { AccountService } from 'src/account/account.service';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { chunkArray } from 'src/common/parsers/chunk-array';
import { generateActivityTitle } from './activity-title';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ACTIVITY_MEDIA_PROCESSING_STATUS } from './activity-media-processing.constants';
import {
  ACTIVITY_CARD_SELECT,
  ACTIVITY_DETAILS_SELECT,
  DEFAULT_ACTIVITY_PAGE_SIZE,
  MEDIA_ACTIVITY_BATCH_SIZE,
} from './const';
import {
  encodeActivityCursor,
  encodeActivityMediaCursor,
  type ActivityCursor,
  type ActivityMediaCursor,
} from './activity.pagination';
import {
  getElevationGainFromKilometreSplits,
  getElevationGainFromLocations,
  normalizeActivityCard,
  normalizeActivityDetails,
  omitMediaProcessingStatus,
} from './utils';
import type { ActivityFeedSqlRow, MigratedActivity } from './type';
import { MediaCleanupService } from 'src/storage/media-cleanup.service';
import { StorageService } from 'src/storage/storage.service';
import type { ActivityDatabase } from './activity-persistence.service';
import { ACTIVITY_VISIBLE_TO_FOLLOWERS, ACTIVITY_VISIBILITY } from './activity-visibility';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
    @Inject(ActivityPersistenceService)
    persistenceService?: ActivityPersistenceService,
    @Optional()
    @Inject(StorageService)
    storageService?: StorageService,
    @Optional()
    @Inject(MediaCleanupService)
    mediaCleanupService?: MediaCleanupService,
  ) {
    this.persistenceService = persistenceService ?? new ActivityPersistenceService(this.prisma);
    this.storageService = storageService;
    this.mediaCleanupService = mediaCleanupService;
  }

  private readonly persistenceService: ActivityPersistenceService;
  private readonly storageService?: StorageService;
  private readonly mediaCleanupService?: MediaCleanupService;

  private async isFollower(viewerId: string, ownerId: string) {
    if (viewerId === ownerId) return false;
    const relation = await this.prisma.friend.findUnique({
      where: { userId_friendId: { userId: viewerId, friendId: ownerId } },
      select: { id: true },
    });
    return Boolean(relation);
  }

  private async getVisibilityFilter(ownerId: string, currentUserId?: string) {
    if (!currentUserId || currentUserId === ownerId) return {};
    const followsOwner = await this.isFollower(currentUserId, ownerId);
    return followsOwner
      ? { visibility: { in: ACTIVITY_VISIBLE_TO_FOLLOWERS } }
      : { visibility: ACTIVITY_VISIBILITY.public };
  }

  async canAccessActivity(id: string, currentUserId?: string) {
    if (!currentUserId) return false;

    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: { userId: true, visibility: true },
    });

    if (!activity) return false;
    if (activity.userId === currentUserId || activity.visibility === ACTIVITY_VISIBILITY.public) return true;
    if (activity.visibility !== ACTIVITY_VISIBILITY.followers) return false;
    return this.isFollower(currentUserId, activity.userId);
  }

  async createActivity(activityDto: ActivityDto, id: string) {
    let uploadedRouteKey: string | undefined;
    let uploadedActivityMediaKeys: string[] = [];
    const mediaCreatedAt = new Date();
    try {
      const account = await this.accountService.getAccountByUserId(id);
      const locations = activityDto.locations;
      const storageService = this.storageService;
      let activityId: string | undefined;
      let routeMetadata;
      let photoVideoUrls = activityDto.photoVideoUrls;
      if (storageService && (locations?.length || photoVideoUrls?.length)) {
        activityId = randomUUID();
        if (locations?.length) {
          routeMetadata = await storageService.uploadActivityRoute(id, activityId, locations);
        }
        if (photoVideoUrls?.length) {
          const promotedMedia = await storageService.promoteActivityPhotos(
            id,
            activityId,
            photoVideoUrls,
            mediaCreatedAt,
          );
          photoVideoUrls = promotedMedia.photos;
          uploadedActivityMediaKeys = promotedMedia.keys;
        }
      }
      uploadedRouteKey = routeMetadata?.key;

      const mapPhotoUrl =
        activityDto?.photoVideoUrls?.length && locations?.length && locations.length > 1
          ? getMapBoxImage(locations)
          : activityDto.mapPhotoUrl;

      const mapPhotoUrlBlurhash = null;
      const activityFields = { ...activityDto };
      delete activityFields.locations;
      activityFields.visibility = activityDto.visibility ?? ACTIVITY_VISIBILITY.public;
      const description = activityDto.description?.trim() || null;

      const data = {
        ...(activityId ? { id: activityId } : {}),
        userId: id,
        profileId: `${account?.id}`,
        ...activityFields,
        description,
        elevationGain: activityDto.locations?.length
          ? getElevationGainFromLocations(activityDto.locations)
          : getElevationGainFromKilometreSplits(activityDto.kilometresSplit),
        title: activityDto.title?.trim()
          ? activityDto.title
          : generateActivityTitle(activityDto.sport, activityDto.date, activityDto.timeZone),
        photoVideoUrls,
        ...(routeMetadata
          ? {
              routeStorageKey: routeMetadata.key,
              routeFormatVersion: routeMetadata.formatVersion,
              routePointCount: routeMetadata.pointCount,
              routeSizeBytes: routeMetadata.sizeBytes,
              routeChecksum: routeMetadata.checksum,
            }
          : {}),
        mapPhotoUrl,
        mapPhotoUrlBlurhash,
        mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued,
      };
      const photoCount = Array.isArray(photoVideoUrls) ? photoVideoUrls.length : 0;
      const locationCount = Array.isArray(activityDto.locations) ? activityDto.locations.length : 0;
      this.logger.log(
        `Сохранение активности: userId=${id}, sport=${activityDto.sport}, date=${activityDto.date}, photos=${photoCount}, locations=${locationCount}`,
      );

      return omitMediaProcessingStatus(await this.persistenceService.create(data));
    } catch (error) {
      await this.deleteUploadedRoute(uploadedRouteKey);
      await Promise.all(uploadedActivityMediaKeys.map((key) => this.deleteUploadedRoute(key)));
      handleServiceError(error);
    }
  }

  async createActivitiesFromMigrationArchive(
    activities: Omit<MigratedActivity, 'id'>[],
    database: ActivityDatabase = this.prisma,
  ) {
    try {
      const activitiesWithTitles = activities.map((activity) => ({
        ...activity,
        title: activity.title?.trim()
          ? activity.title
          : generateActivityTitle(activity.sport, activity.date, activity.timeZone),
      }));
      const chunkedActivities = chunkArray(activitiesWithTitles, 100);
      const insertedCounts = await Promise.all(
        chunkedActivities.map(async (activityBatch) => {
          const preparedActivities: Awaited<ReturnType<typeof this.prepareActivityRoute>>[] = [];
          try {
            for (const activity of activityBatch) preparedActivities.push(await this.prepareActivityRoute(activity));
            this.logger.debug(`Writing activity batch (${activityBatch.length} records)`);
            return await this.persistenceService.createMany(
              preparedActivities.map(({ data }) => data as unknown as Record<string, unknown>),
              database,
            );
          } catch (error) {
            await Promise.all(preparedActivities.map(({ routeKey }) => this.deleteUploadedRoute(routeKey)));
            throw error;
          }
        }),
      );
      return {
        success: true,
        importedActivities: insertedCounts.reduce((total, result) => total + result.count, 0),
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async updateActivity(activityDto: ActivityDto, id: string, userId = id) {
    try {
      const { date, description, emotion, visibility, sport, title, distance, duration, speed } = activityDto;
      const data = {
        title,
        sport,
        visibility,
        emotion,
        date,
        description: description?.trim() || null,
        distance,
        duration,
        speed,
      };
      const activity = await this.persistenceService.update(id, userId, data);
      return omitMediaProcessingStatus(
        activity ? normalizeActivityDetails(activity as Record<string, unknown>) : activity,
      );
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getLocationsByActivityId(id: string, currentUserId?: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: {
        routeStorageKey: true,
        kilometresSplit: true,
        userId: true,
        visibility: true,
      },
    });
    if (!activity || !currentUserId || !(await this.canAccessActivity(id, currentUserId))) return null;
    let locations: LocationObject[] | undefined;
    if (activity.routeStorageKey) {
      if (!this.storageService) throw new Error('Сервис хранения маршрутов не настроен');
      locations = await this.storageService.readActivityRoute(activity.routeStorageKey);
    }
    return { locations, kilometresSplit: activity.kilometresSplit };
  }

  async getActivityByActivityId(id: string, currentUserId?: string) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id },
        select: ACTIVITY_DETAILS_SELECT,
      });
      if (!activity || !currentUserId || !(await this.canAccessActivity(id, currentUserId))) return null;
      return activity ? normalizeActivityDetails(activity as Record<string, unknown>) : activity;
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getMediaByUserId(id: string, take = '10', cursor?: ActivityMediaCursor, currentUserId?: string) {
    try {
      const pageSize = Number(take);
      const photos: unknown[] = [];
      const photoCursors: ActivityMediaCursor[] = [];
      let activityCursor: ActivityCursor | undefined = cursor;
      let includeCursorActivity = Boolean(cursor);
      let skipPhotoIndex = cursor?.photoIndex ?? -1;
      const visibilityFilter = await this.getVisibilityFilter(id, currentUserId);

      while (photos.length <= pageSize) {
        const activities = await this.prisma.activity.findMany({
          // @ts-ignore Prisma's generated JSON filter type does not accept SQL NULL here.
          where: {
            userId: id,
            photoVideoUrls: { not: null },
            ...visibilityFilter,
            ...(activityCursor
              ? {
                  OR: [
                    { date: { lt: activityCursor.date } },
                    { date: activityCursor.date, id: { lt: activityCursor.id } },
                    ...(includeCursorActivity ? [{ date: activityCursor.date, id: activityCursor.id }] : []),
                  ],
                }
              : {}),
          },
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          take: MEDIA_ACTIVITY_BATCH_SIZE,
          select: { id: true, date: true, photoVideoUrls: true },
        });

        if (!activities.length) break;

        for (const activity of activities) {
          const activityPhotos = Array.isArray(activity.photoVideoUrls) ? activity.photoVideoUrls : [];
          const firstPhotoIndex =
            includeCursorActivity && activity.id === cursor?.id && activity.date.getTime() === cursor?.date.getTime()
              ? skipPhotoIndex + 1
              : 0;

          for (let photoIndex = firstPhotoIndex; photoIndex < activityPhotos.length; photoIndex += 1) {
            photos.push(activityPhotos[photoIndex]);
            photoCursors.push({ date: activity.date, id: activity.id, photoIndex });
            if (photos.length > pageSize) break;
          }
          if (photos.length > pageSize) break;
        }

        const lastActivity = activities.at(-1)!;
        activityCursor = { date: lastActivity.date, id: lastActivity.id };
        includeCursorActivity = false;
        skipPhotoIndex = -1;
        if (activities.length < MEDIA_ACTIVITY_BATCH_SIZE) break;
      }

      const hasMore = photos.length > pageSize;
      const slicedPhotos = photos.slice(0, pageSize);
      const slicedCursors = photoCursors.slice(0, pageSize);
      return {
        photos: slicedPhotos,
        hasMore,
        nextCursor: hasMore && slicedCursors.length ? encodeActivityMediaCursor(slicedCursors.at(-1)!) : null,
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
      const visibilityFilter = await this.getVisibilityFilter(id, currentUserId);
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
        .map((activity: Record<string, unknown>) => normalizeActivityCard(activity as Record<string, unknown>));
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
      return activities.map((activity: Record<string, unknown>) => normalizeActivityCard(activity));
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
          a."photoVideoUrls",
          a."mapPhotoUrl",
          a."mapPhotoUrlBlurhash",
          a."duration",
          a."distance",
          a."steps",
          a."elevationGain",
          a."kilometresSplit",
          json_build_object(
            'surname', p."surname",
            'name', p."name",
            'profilePhoto', p."profilePhoto",
            'profilePhotoBlurhash', p."profilePhotoBlurhash",
            'emailNotifications', p."emailNotifications",
            'user', json_build_object('email', u."email")
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
        INNER JOIN "Users" AS u ON u."id" = a."user_id"
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
        .map((activity: ActivityFeedSqlRow) => normalizeActivityCard(activity as Record<string, unknown>));
      const currentUserProfile =
        typeof this.accountService.getAccountByUserId === 'function'
          ? await this.accountService.getAccountByUserId(currentUserId)
          : undefined;
      return {
        activities,
        ...(currentUserProfile
          ? {
              currentUserProfile: {
                surname: currentUserProfile.surname,
                name: currentUserProfile.name,
                profilePhoto: currentUserProfile.profilePhoto,
                profilePhotoBlurhash: currentUserProfile.profilePhotoBlurhash,
                emailNotifications: currentUserProfile.emailNotifications,
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

  async deleteActivityById(id: string, userId = id) {
    try {
      if (!this.mediaCleanupService) return await this.persistenceService.delete(id, userId);

      return await this.prisma.$transaction(async (transaction) => {
        const activity = await transaction.activity.findFirst({
          where: { id, userId },
          select: { routeStorageKey: true, photoVideoUrls: true },
        });
        const storageKeys = this.getActivityStorageKeys(userId, activity);
        await Promise.all(
          storageKeys.map((storageKey) =>
            this.mediaCleanupService!.enqueueObjectCleanup(userId, storageKey, transaction as never),
          ),
        );
        return await transaction.activity.delete({ where: { id, userId } });
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  private async prepareActivityRoute<
    T extends ActivityDto & { userId: string; profileId: string; sourceElevationGain?: number },
  >(activity: T) {
    const { sourceElevationGain } = activity;
    const hasSourceElevationGain =
      typeof sourceElevationGain === 'number' && Number.isFinite(sourceElevationGain) && sourceElevationGain >= 0;
    const elevationGain = hasSourceElevationGain
      ? sourceElevationGain
      : activity.locations?.length
        ? getElevationGainFromLocations(activity.locations)
        : getElevationGainFromKilometreSplits(activity.kilometresSplit);
    if (!activity.locations?.length || !this.storageService) {
      const dataWithoutLocations = { ...activity };
      delete dataWithoutLocations.locations;
      delete dataWithoutLocations.sourceElevationGain;
      return {
        data: {
          ...dataWithoutLocations,
          elevationGain,
        },
        routeKey: undefined,
      };
    }

    const activityId = 'id' in activity && typeof activity.id === 'string' ? activity.id : randomUUID();
    const routeMetadata = await this.storageService.uploadActivityRoute(
      activity.userId,
      activityId,
      activity.locations,
    );
    const dataWithoutLocations = { ...activity };
    delete dataWithoutLocations.locations;
    delete dataWithoutLocations.sourceElevationGain;
    return {
      data: {
        ...dataWithoutLocations,
        elevationGain,
        id: activityId,
        routeStorageKey: routeMetadata.key,
        routeFormatVersion: routeMetadata.formatVersion,
        routePointCount: routeMetadata.pointCount,
        routeSizeBytes: routeMetadata.sizeBytes,
        routeChecksum: routeMetadata.checksum,
      },
      routeKey: routeMetadata.key,
    };
  }

  private async deleteUploadedRoute(routeKey?: string) {
    if (!routeKey || !this.storageService) return;
    try {
      await this.storageService.deleteObjectByKey(routeKey);
    } catch (error) {
      this.logger.error(`Не удалось удалить незавершённый маршрут ${routeKey}`, error);
    }
  }

  private getActivityStorageKeys(
    userId: string,
    activity: { routeStorageKey: string | null; photoVideoUrls: unknown } | null,
  ) {
    const keys = new Set<string>();
    if (activity?.routeStorageKey?.startsWith(`${userId}/`)) keys.add(activity.routeStorageKey);

    if (!this.storageService || !Array.isArray(activity?.photoVideoUrls)) return [...keys];
    for (const media of activity.photoVideoUrls) {
      for (const url of this.getMediaUrls(media)) {
        try {
          keys.add(this.storageService.getOwnedKey(userId, url));
        } catch {
          this.logger.warn(`Пропускаю внешний или некорректный медиа-файл активности: ${url}`);
        }
      }
    }
    return [...keys];
  }

  private getMediaUrls(media: unknown) {
    if (typeof media === 'string') return [media];
    if (!media || typeof media !== 'object') return [];

    return ['url' in media ? media.url : undefined, 'thumbnail' in media ? media.thumbnail : undefined].filter(
      (url): url is string => typeof url === 'string',
    );
  }

  async getActivityWithEmailData(activityId: string) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        select: {
          user: {
            select: {
              email: true,
            },
          },
          profile: {
            select: {
              id: true,
              profilePhoto: true,
              name: true,
              surname: true,
              emailNotifications: true,
            },
          },
          mapPhotoUrl: true,
        },
      });
      return { profile: activity?.profile, email: activity?.user.email, mapPhotoUrl: activity?.mapPhotoUrl };
    } catch (error) {
      handleServiceError(error);
    }
  }
}
