import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ActivityDto, type ActivityMediaObject, type LocationObject } from './activity.dto';
import { handleServiceError } from 'src/common/utils/database-errors';
import { AccountService } from 'src/account/account.service';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { chunkArray } from 'src/common/parsers/chunk-array';
import { generateActivityTitle } from './activity-title';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ACTIVITY_ENRICHMENT_STATUS } from './activity-enrichment.constants';
import { ACTIVITY_MEDIA_PROCESSING_STATUS } from './activity-media-processing.constants';
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
import { calculateActiveCalories } from './activity-calories';
import { StaticMapService } from 'src/common/maps/static-map.service';
import { reduceLocations } from 'src/common/parsers/reduce-locations';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { SubscriptionService } from 'src/subscription/subscription.service';

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
    @Optional()
    @Inject(StaticMapService)
    staticMapService?: StaticMapService,
    @Optional()
    @Inject(SubscriptionService)
    _subscriptionService?: SubscriptionService,
  ) {
    void _subscriptionService;
    this.persistenceService = persistenceService ?? new ActivityPersistenceService(this.prisma);
    this.storageService = storageService;
    this.mediaCleanupService = mediaCleanupService;
    this.staticMapService = staticMapService;
  }

  private readonly persistenceService: ActivityPersistenceService;
  private readonly storageService?: StorageService;
  private readonly mediaCleanupService?: MediaCleanupService;
  private readonly staticMapService?: StaticMapService;

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
    let uploadedMapKey: string | undefined;
    let uploadedActivityMediaKeys: string[] = [];
    const mediaCreatedAt = new Date();
    try {
      const account = await this.accountService.getAccountByUserId(id);
      const locations = activityDto.locations;
      const storageService = this.storageService;
      let media = activityDto.media;
      let activityId: string | undefined = media?.length ? randomUUID() : undefined;
      let routeMetadata;
      if (!activityId && storageService && locations?.length) activityId = randomUUID();
      if (storageService && (locations?.length || media?.length)) {
        activityId ??= randomUUID();
        if (locations?.length) {
          routeMetadata = await storageService.uploadActivityRoute(id, activityId, locations);
        }
        if (media?.length) {
          const promotedMedia = await storageService.promoteActivityPhotos(id, activityId, media, mediaCreatedAt);
          media = promotedMedia.photos;
          uploadedActivityMediaKeys = promotedMedia.keys;
        }
      }
      uploadedRouteKey = routeMetadata?.key;

      const generatedMap = locations?.length
        ? this.staticMapService
          ? await this.staticMapService.generateActivityMap({ userId: id, activityId, locations })
          : undefined
        : undefined;
      uploadedMapKey = generatedMap?.key;
      const mapPhotoUrl = locations?.length
        ? (generatedMap?.url ?? (this.staticMapService ? null : getMapBoxImage(locations)))
        : activityDto.mapPhotoUrl;

      const mapPhotoUrlBlurhash = null;
      const activityFields = { ...activityDto };
      delete activityFields.locations;
      delete activityFields.media;
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
        caloriesActive: calculateActiveCalories({
          weight: account?.weight,
          height: account?.height,
          age: account?.age,
          gender: account?.gender,
          sport: activityDto.sport,
          distance: activityDto.distance,
          duration: activityDto.duration,
        }),
      };
      const mediaCount = Array.isArray(media) ? media.length : 0;
      const locationCount = Array.isArray(activityDto.locations) ? activityDto.locations.length : 0;
      this.logger.log(
        `Сохранение активности: userId=${id}, sport=${activityDto.sport}, date=${activityDto.date}, media=${mediaCount}, locations=${locationCount}`,
      );

      const mediaRows = this.getActivityMediaRows(activityId, id, data.date ?? new Date(), media);
      return omitMediaProcessingStatus(await this.persistenceService.create(data, mediaRows));
    } catch (error) {
      await this.deleteUploadedRoute(uploadedRouteKey);
      await this.deleteUploadedRoute(uploadedMapKey);
      await Promise.all(uploadedActivityMediaKeys.map((key) => this.deleteUploadedRoute(key)));
      handleServiceError(error);
    }
  }

  async createActivitiesFromMigrationArchive(
    activities: Omit<MigratedActivity, 'id'>[],
    database: ActivityDatabase = this.prisma,
  ): Promise<{ success: true; importedActivities: number }> {
    if (!activities.length) return { success: true, importedActivities: 0 };

    if (database === this.prisma) {
      try {
        return await this.prisma.$transaction((transaction) =>
          this.createActivitiesFromMigrationArchive(activities, transaction),
        );
      } catch (error) {
        handleServiceError(error);
      }
    }

    try {
      const seenSourceActivities = new Set<string>();
      const uniqueActivities = activities.filter((activity) => {
        const key = activity.userId + '\u0000' + activity.source + '\u0000' + activity.sourceActivityId;
        if (seenSourceActivities.has(key)) return false;
        seenSourceActivities.add(key);
        return true;
      });
      const activityIdsByUser = new Map<string, Set<string>>();
      for (const activity of uniqueActivities) {
        const ids = activityIdsByUser.get(activity.userId) ?? new Set<string>();
        ids.add(activity.sourceActivityId);
        activityIdsByUser.set(activity.userId, ids);
      }
      const existingActivities = activityIdsByUser.size
        ? ((await database.activity.findMany({
            where: {
              OR: [...activityIdsByUser].map(([userId, sourceActivityIds]) => ({
                userId,
                source: 'strava',
                sourceActivityId: { in: [...sourceActivityIds] },
              })),
            },
            select: { id: true, userId: true, sourceActivityId: true, routeStorageKey: true, mapPhotoUrl: true },
          })) as {
            id: string;
            userId: string;
            sourceActivityId: string;
            routeStorageKey: string | null;
            mapPhotoUrl: string | null;
          }[])
        : [];
      const existingActivitiesBySource = new Map(
        existingActivities.map(
          (activity) => [activity.userId + '\u0000strava\u0000' + activity.sourceActivityId, activity] as const,
        ),
      );
      const activitiesWithTitles = uniqueActivities.map((activity) => {
        const key = activity.userId + '\u0000' + activity.source + '\u0000' + activity.sourceActivityId;
        const existingActivity = existingActivitiesBySource.get(key);
        const sourceId = 'id' in activity && typeof activity.id === 'string' ? activity.id : randomUUID();
        return {
          ...activity,
          // Use a fresh storage namespace for replacements so immutable map caches cannot serve old imagery.
          id: existingActivity ? randomUUID() : sourceId,
          title: activity.title?.trim()
            ? activity.title
            : generateActivityTitle(activity.sport, activity.date, activity.timeZone),
        };
      });
      const chunkedActivities = chunkArray(activitiesWithTitles, 100);
      const importedCounts = await Promise.all(
        chunkedActivities.map(async (activityBatch) => {
          const preparedActivities: {
            data: Record<string, unknown>;
            routeKey?: string;
            mapKey?: string;
            existingActivity?: (typeof existingActivities)[number];
            userId: string;
          }[] = [];
          try {
            for (const activity of activityBatch) {
              const key = activity.userId + '\u0000' + activity.source + '\u0000' + activity.sourceActivityId;
              const existingActivity = existingActivitiesBySource.get(key);
              const prepared = await this.prepareActivityRoute(activity);
              const preparedData = prepared.data as unknown as Record<string, unknown>;
              const data = existingActivity
                ? {
                    ...preparedData,
                    id: existingActivity.id,
                    timeZone: preparedData.timeZone ?? null,
                    description: preparedData.description ?? null,
                    elevationGain: preparedData.elevationGain ?? null,
                    kilometresSplit: preparedData.kilometresSplit ?? [],
                    mapPhotoUrl:
                      typeof preparedData.mapPhotoUrl === 'string' && preparedData.mapPhotoUrl.trim()
                        ? preparedData.mapPhotoUrl
                        : null,
                    routeStorageKey: preparedData.routeStorageKey ?? null,
                    routeFormatVersion: preparedData.routeFormatVersion ?? null,
                    routePointCount: preparedData.routePointCount ?? null,
                    routeSizeBytes: preparedData.routeSizeBytes ?? null,
                    routeChecksum: preparedData.routeChecksum ?? null,
                    mapPhotoUrlBlurhash: null,
                    mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued,
                    locationName: null,
                    weatherTemperature: null,
                    weatherWindSpeed: null,
                    weatherCode: null,
                    locationEnrichmentStatus: ACTIVITY_ENRICHMENT_STATUS.queued,
                    caloriesActive: null,
                  }
                : preparedData;
              preparedActivities.push({
                data,
                routeKey: prepared.routeKey,
                mapKey: prepared.mapKey,
                existingActivity,
                userId: activity.userId,
              });
            }

            this.logger.debug(`Writing activity batch (${activityBatch.length} records)`);
            const preparedData = preparedActivities.map(({ data }) => {
              const activityData = { ...data };
              delete activityData.media;
              return activityData;
            });
            const media = preparedActivities.flatMap(({ data }) =>
              this.getActivityMediaRows(data.id, data.userId, data.date ?? new Date(), data.media),
            );
            const result = await this.persistenceService.upsertMany(preparedData, database, media);
            const cleanupJobs = preparedActivities.flatMap(({ routeKey, mapKey, existingActivity, userId }) => {
              if (!existingActivity) return [];
              const oldKeys = this.getActivityStorageKeys(userId, {
                routeStorageKey: existingActivity.routeStorageKey,
                mapPhotoUrl: existingActivity.mapPhotoUrl,
                media: [],
              });
              const newKeys = new Set([routeKey, mapKey].filter((key): key is string => Boolean(key)));
              return oldKeys.filter((key) => !newKeys.has(key)).map((storageKey) => ({ userId, storageKey }));
            });
            if (this.mediaCleanupService) {
              await Promise.all(
                cleanupJobs.map(({ userId, storageKey }) =>
                  this.mediaCleanupService!.enqueueObjectCleanup(userId, storageKey, database),
                ),
              );
            }
            return result;
          } catch (error) {
            await Promise.all(
              preparedActivities
                .flatMap(({ routeKey, mapKey }) => [routeKey, mapKey])
                .map((key) => this.deleteUploadedRoute(key)),
            );
            throw error;
          }
        }),
      );
      return {
        success: true,
        importedActivities: importedCounts.reduce((total, result) => total + result.count, 0),
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async appendActivityMedia(activityId: string, userId: string, media: ActivityMediaObject[]) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { userId: true, date: true },
    });
    if (!activity) throw new NotFoundException('Активность не найдена');
    if (activity.userId !== userId) throw new ForbiddenException('Недостаточно прав');
    if (!this.storageService) throw new ServiceUnavailableException('Сервис хранения медиа не настроен');

    const existingCount = await this.prisma.activityMedia.count({ where: { activityId } });
    if (existingCount + media.length > UPLOAD_LIMITS.activityMediaFiles) {
      throw new BadRequestException(
        'К активности можно добавить не больше ' + UPLOAD_LIMITS.activityMediaFiles + ' файлов',
      );
    }

    let promotedKeys: string[] = [];
    try {
      const promoted = await this.storageService.promoteActivityPhotos(userId, activityId, media, new Date());
      promotedKeys = promoted.keys;
      await this.prisma.$transaction(async (transaction) => {
        const currentCount = await transaction.activityMedia.count({ where: { activityId } });
        if (currentCount + promoted.photos.length > UPLOAD_LIMITS.activityMediaFiles) {
          throw new BadRequestException(
            'К активности можно добавить не больше ' + UPLOAD_LIMITS.activityMediaFiles + ' файлов',
          );
        }
        const lastMedia = await transaction.activityMedia.findFirst({
          where: { activityId },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        const positionOffset = (lastMedia?.position ?? -1) + 1;
        const rows = this.getActivityMediaRows(activityId, userId, activity.date, promoted.photos).map(
          (row, index) => ({ ...row, position: positionOffset + index }),
        );
        await transaction.activityMedia.createMany({ data: rows });
        await transaction.activity.update({
          where: { id: activityId },
          data: { mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued },
        });
      });
      return { success: true, media: promoted.photos };
    } catch (error) {
      await Promise.all(promotedKeys.map((key) => this.deleteUploadedRoute(key)));
      handleServiceError(error);
    }
  }

  async updateActivity(activityDto: ActivityDto, id: string, userId = id) {
    try {
      const { date, description, emotion, visibility, sport, title, distance, duration, speed } = activityDto;
      const account = await this.accountService.getAccountByUserId(userId);
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
        caloriesActive: calculateActiveCalories({
          weight: account?.weight,
          height: account?.height,
          age: account?.age,
          gender: account?.gender,
          sport,
          distance,
          duration,
        }),
      };
      const activity = await this.persistenceService.update(id, userId, data);
      if (date) {
        await this.prisma.activityMedia.updateMany({ where: { activityId: id }, data: { activityDate: date } });
      }
      return omitMediaProcessingStatus(
        activity ? normalizeActivityDetails(activity as Record<string, unknown>) : activity,
      );
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getLocationsByActivityId(id: string, currentUserId?: string, _replay = false) {
    void _replay;
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: {
        routeStorageKey: true,
        kilometresSplit: true,
        userId: true,
        visibility: true,
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
      (isOwner || (await this.isFollower(currentUserId, activity.userId)));
    if (!isOwner && !isPublic && !isFollowerActivity) return null;
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
      const visibilityFilter = await this.getVisibilityFilter(id, currentUserId);
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
          url: true,
          thumbnail: true,
          blurhash: true,
        },
      });
      const hasMore = media.length > pageSize;
      const slicedMedia = media.slice(0, pageSize) as Array<{
        activityDate: Date;
        activityId: string;
        position: number;
        url: string;
        thumbnail: string | null;
        blurhash: string | null;
      }>;
      const lastMedia = slicedMedia.at(-1);
      return {
        media: slicedMedia.map(({ url, thumbnail, blurhash }) => ({ url, thumbnail, blurhash })),
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
          COALESCE(
            (
              SELECT json_agg(
                json_build_object('url', am."url", 'thumbnail', am."thumbnail", 'blurhash', am."blurhash")
                ORDER BY am."position" ASC
              )
              FROM "ActivityMedia" AS am
              WHERE am."activity_id" = a."id"
            ),
            '[]'::json
              ) AS "media",
          a."mapPhotoUrl",
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
          select: {
            routeStorageKey: true,
            mapPhotoUrl: true,
            media: { select: { url: true, thumbnail: true } },
          },
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
        mapKey: undefined,
      };
    }

    const activityId = 'id' in activity && typeof activity.id === 'string' ? activity.id : randomUUID();
    const routeMetadata = await this.storageService.uploadActivityRoute(
      activity.userId,
      activityId,
      activity.locations,
    );
    const generatedMap = this.staticMapService
      ? await this.staticMapService.generateActivityMap({
          userId: activity.userId,
          activityId,
          locations: activity.locations,
        })
      : undefined;
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
        ...(this.staticMapService
          ? { mapPhotoUrl: generatedMap?.url ?? dataWithoutLocations.mapPhotoUrl ?? null }
          : {}),
      },
      routeKey: routeMetadata.key,
      mapKey: generatedMap?.key,
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
    activity: { routeStorageKey: string | null; mapPhotoUrl?: string | null; media: unknown } | null,
  ) {
    const keys = new Set<string>();
    if (activity?.routeStorageKey?.startsWith(`${userId}/`)) keys.add(activity.routeStorageKey);

    if (this.storageService && activity?.mapPhotoUrl) {
      try {
        keys.add(this.storageService.getOwnedKey(userId, activity.mapPhotoUrl));
      } catch {
        // Mapbox and other external URLs are intentionally not deleted here.
      }
    }

    if (!this.storageService || !Array.isArray(activity?.media)) return [...keys];
    for (const media of activity.media) {
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

  private getActivityMediaRows(
    activityId: unknown,
    userId: unknown,
    activityDate: unknown,
    media: unknown,
  ): Record<string, unknown>[] {
    if (typeof activityId !== 'string' || typeof userId !== 'string') return [];
    if (!(activityDate instanceof Date) && typeof activityDate !== 'string') return [];
    if (!Array.isArray(media)) return [];

    return media.flatMap((item, position) => {
      if (typeof item === 'string') {
        return [{ activityId, userId, activityDate, position, url: item, thumbnail: null, blurhash: null }];
      }
      if (!item || typeof item !== 'object' || !('url' in item) || typeof item.url !== 'string') return [];

      const photo = item as ActivityMediaObject;
      return [
        {
          activityId,
          userId,
          activityDate,
          position,
          url: photo.url,
          thumbnail: photo.thumbnail ?? null,
          blurhash: photo.blurhash ?? null,
        },
      ];
    });
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
