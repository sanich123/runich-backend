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
import { ActivityDto, type ActivityMediaObject, type WatchWorkoutImportDto } from './activity.dto';
import { handleServiceError } from 'src/common/utils/database-errors';
import { AccountService } from 'src/account/account.service';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { chunkArray } from 'src/common/parsers/chunk-array';
import { generateActivityTitle } from './activity-title';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ActivityAccessService } from './activity-access.service';
import { ActivityReadService } from './activity-read.service';
import { ACTIVITY_ENRICHMENT_STATUS } from './activity-enrichment.constants';
import { ACTIVITY_MEDIA_PROCESSING_STATUS } from './activity-media-processing.constants';
import { ACTIVITY_FAVORITE_ERROR_MESSAGES, DEFAULT_ACTIVITY_PAGE_SIZE } from './const';
import type { ActivityCursor, ActivityMediaCursor } from './activity.pagination';
import {
  getElevationGainFromKilometreSplits,
  getElevationGainFromLocations,
  normalizeActivityDetails,
  omitMediaProcessingStatus,
} from './utils';
import type { MigratedActivity } from './type';
import { MediaCleanupService } from 'src/storage/media-cleanup.service';
import { StorageService } from 'src/storage/storage.service';
import type { ActivityDatabase } from './activity-persistence.service';
import { ACTIVITY_VISIBILITY } from './activity-visibility';
import { calculateActiveCalories } from './activity-calories';
import { StaticMapService } from 'src/common/maps/static-map.service';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';

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
    @Inject(ActivityAccessService)
    activityAccessService?: ActivityAccessService,
    @Optional()
    @Inject(ActivityReadService)
    activityReadService?: ActivityReadService,
  ) {
    this.persistenceService = persistenceService ?? new ActivityPersistenceService(this.prisma);
    this.storageService = storageService;
    this.mediaCleanupService = mediaCleanupService;
    this.staticMapService = staticMapService;
    this.accessService = activityAccessService ?? new ActivityAccessService(this.prisma);
    this.readService =
      activityReadService ??
      new ActivityReadService(this.prisma, this.accountService, this.accessService, storageService);
  }

  private readonly persistenceService: ActivityPersistenceService;
  private readonly storageService?: StorageService;
  private readonly mediaCleanupService?: MediaCleanupService;
  private readonly staticMapService?: StaticMapService;
  private readonly accessService: ActivityAccessService;
  private readonly readService: ActivityReadService;

  async canAccessActivity(id: string, currentUserId?: string) {
    return await this.accessService.canAccessActivity(id, currentUserId);
  }

  async canAccessActivityData(activity: { userId: string; visibility: string } | null, currentUserId?: string) {
    return await this.accessService.canAccessActivityData(activity, currentUserId);
  }

  async canInteractWithActivity(id: string, currentUserId: string) {
    return await this.accessService.canInteractWithActivity(id, currentUserId);
  }

  async createActivity(activityDto: ActivityDto, id: string) {
    let uploadedRouteKey: string | undefined;
    let uploadedMapKey: string | undefined;
    let uploadedActivityMediaKeys: string[] = [];
    const mediaCreatedAt = new Date();
    try {
      if (activityDto.source && activityDto.sourceActivityId) {
        const existingActivity = await this.prisma.activity.findUnique({
          where: {
            userId_source_sourceActivityId: {
              userId: id,
              source: activityDto.source,
              sourceActivityId: activityDto.sourceActivityId,
            },
          },
        });
        if (existingActivity) return omitMediaProcessingStatus(existingActivity);
      }

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

  async importWatchWorkouts(workouts: WatchWorkoutImportDto[], userId: string) {
    const uniqueWorkouts = workouts.filter((workout, index, all) => {
      return (
        all.findIndex(
          (candidate) => candidate.source === workout.source && candidate.sourceActivityId === workout.sourceActivityId,
        ) === index
      );
    });

    type ExistingWatchWorkoutActivity = {
      id: string;
      source: string | null;
      sourceActivityId: string | null;
      profileId: string;
      routeStorageKey: string | null;
      mapPhotoUrl: string | null;
    };
    const existingActivities = (
      uniqueWorkouts.length
        ? await this.prisma.activity.findMany({
            where: {
              userId,
              OR: uniqueWorkouts.map(({ source, sourceActivityId }) => ({ source, sourceActivityId })),
            },
            select: {
              id: true,
              source: true,
              sourceActivityId: true,
              profileId: true,
              routeStorageKey: true,
              mapPhotoUrl: true,
            },
          })
        : []
    ) as ExistingWatchWorkoutActivity[];
    const existingActivitiesBySource = new Map<string, ExistingWatchWorkoutActivity>(
      existingActivities.map((activity) => [`${activity.source}\u0000${activity.sourceActivityId}`, activity] as const),
    );
    const activities: unknown[] = [];

    for (const workout of uniqueWorkouts) {
      const key = `${workout.source}\u0000${workout.sourceActivityId}`;
      const existingActivity = existingActivitiesBySource.get(key);
      if (existingActivity) {
        if (existingActivity.id) {
          activities.push(await this.syncExistingWatchWorkout(workout, existingActivity, userId));
        }
        continue;
      }
      activities.push(await this.createActivity(workout, userId));
    }

    return {
      imported: activities.length,
      skipped: workouts.length - activities.length,
      activities,
    };
  }

  private async syncExistingWatchWorkout(
    workout: WatchWorkoutImportDto,
    existingActivity: {
      id: string;
      profileId: string;
      routeStorageKey: string | null;
      mapPhotoUrl: string | null;
    },
    userId: string,
  ) {
    let uploadedRouteKey: string | undefined;
    let uploadedMapKey: string | undefined;
    let preparedData: Record<string, unknown> = {};
    let updatedActivity: unknown;

    try {
      if (workout.locations?.length) {
        const prepared = await this.prepareActivityRoute({
          ...workout,
          // Use a fresh storage namespace so route and map caches cannot serve an older sync.
          id: randomUUID(),
          userId,
          profileId: existingActivity.profileId,
        });
        preparedData = prepared.data as unknown as Record<string, unknown>;
        uploadedRouteKey = prepared.routeKey;
        uploadedMapKey = prepared.mapKey;
      }

      const updateData: Record<string, unknown> = {
        date: workout.date,
        sport: workout.sport,
        duration: workout.duration,
        distance: workout.distance,
        speed: workout.speed,
      };
      if (workout.timeZone !== undefined) updateData.timeZone = workout.timeZone;
      if (workout.steps !== undefined) updateData.steps = workout.steps;
      if (workout.title?.trim()) updateData.title = workout.title.trim();
      if (workout.kilometresSplit !== undefined) updateData.kilometresSplit = workout.kilometresSplit;
      if (preparedData.elevationGain !== undefined) updateData.elevationGain = preparedData.elevationGain;

      if (uploadedRouteKey) {
        updateData.routeStorageKey = preparedData.routeStorageKey;
        updateData.routeFormatVersion = preparedData.routeFormatVersion;
        updateData.routePointCount = preparedData.routePointCount;
        updateData.routeSizeBytes = preparedData.routeSizeBytes;
        updateData.routeChecksum = preparedData.routeChecksum;
        updateData.mediaProcessingStatus = ACTIVITY_MEDIA_PROCESSING_STATUS.queued;
        updateData.mapPhotoUrlBlurhash = null;
        updateData.locationName = null;
        updateData.weatherTemperature = null;
        updateData.weatherWindSpeed = null;
        updateData.weatherCode = null;
        updateData.locationEnrichmentStatus = ACTIVITY_ENRICHMENT_STATUS.queued;
        if ('mapPhotoUrl' in preparedData) updateData.mapPhotoUrl = preparedData.mapPhotoUrl;
      }

      updatedActivity = await this.prisma.activity.update({
        where: { id: existingActivity.id },
        data: updateData as never,
      });
    } catch (error) {
      await Promise.all([this.deleteUploadedRoute(uploadedRouteKey), this.deleteUploadedRoute(uploadedMapKey)]);
      handleServiceError(error);
    }

    if (uploadedRouteKey && this.mediaCleanupService) {
      const oldKeys = this.getActivityStorageKeys(userId, {
        routeStorageKey: existingActivity.routeStorageKey,
        mapPhotoUrl: existingActivity.mapPhotoUrl,
        media: [],
      });
      const newKeys = new Set([uploadedRouteKey, uploadedMapKey].filter((key): key is string => Boolean(key)));
      try {
        await Promise.all(
          oldKeys
            .filter((key) => !newKeys.has(key))
            .map((storageKey) => this.mediaCleanupService!.enqueueObjectCleanup(userId, storageKey)),
        );
      } catch (error) {
        this.logger.error('Не удалось поставить старые файлы активности в очередь удаления', error);
      }
    }

    return omitMediaProcessingStatus(updatedActivity);
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

  async deleteActivityMedia(activityId: string, mediaId: string, userId: string) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        select: { userId: true },
      });
      if (!activity) throw new NotFoundException('Активность не найдена');
      if (activity.userId !== userId) throw new ForbiddenException('Недостаточно прав');
      if (!this.mediaCleanupService || !this.storageService) {
        throw new ServiceUnavailableException('Сервис удаления медиа не настроен');
      }

      await this.prisma.$transaction(async (transaction) => {
        const media = await transaction.activityMedia.findFirst({
          where: { id: mediaId, activityId, userId },
          select: { url: true, thumbnail: true },
        });
        if (!media) throw new NotFoundException('Медиа активности не найдено');

        const storageKeys = this.getMediaStorageKeys(userId, media);
        await Promise.all(
          storageKeys.map((storageKey) =>
            this.mediaCleanupService!.enqueueObjectCleanup(userId, storageKey, transaction as never),
          ),
        );
        await transaction.activityMedia.delete({ where: { id: mediaId } });
      });

      return { success: true };
    } catch (error) {
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

  async getLocationsByActivityId(id: string, currentUserId?: string) {
    return await this.readService.getLocationsByActivityId(id, currentUserId);
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

  async setActivityFavorite(id: string, currentUserId: string, isFavorite: boolean) {
    try {
      const activity = await this.prisma.activity.findUnique({ where: { id }, select: { userId: true } });
      if (!activity) throw new NotFoundException(ACTIVITY_FAVORITE_ERROR_MESSAGES.notFound);
      if (activity.userId !== currentUserId) throw new ForbiddenException(ACTIVITY_FAVORITE_ERROR_MESSAGES.forbidden);
      return await this.prisma.activity.update({
        where: { id },
        data: { isFavorite },
        select: { id: true, isFavorite: true },
      });
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

    if (Array.isArray(activity?.media)) {
      for (const media of activity.media) {
        for (const key of this.getMediaStorageKeys(userId, media)) keys.add(key);
      }
    }
    return [...keys];
  }

  private getMediaStorageKeys(userId: string, media: unknown) {
    if (!this.storageService) return [];
    const keys = new Set<string>();
    for (const url of this.getMediaUrls(media)) {
      try {
        keys.add(this.storageService.getOwnedKey(userId, url));
      } catch {
        this.logger.warn(`Пропускаю внешний или некорректный медиа-файл активности: ${url}`);
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
}
