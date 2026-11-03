import { Inject, Injectable, Optional, Logger } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { AccountService } from 'src/account/account.service';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ActivityMediaService } from './activity-media.service';
import { StorageService } from 'src/storage/services/storage.service';
import { MediaCleanupService } from 'src/storage/services/media-cleanup.service';
import { StaticMapService } from 'src/common/maps/static-map.service';
import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ActivityDto } from '../dto/activity.dto';
import { handleServiceError } from 'src/common/utils/database-errors';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import {
  calculateActiveCalories,
  generateActivityTitle,
  getElevationGainFromKilometreSplits,
  getElevationGainFromLocations,
  getHeartRateStatistics,
  normalizeActivityDetails,
  omitActivityHeartRateSamples,
  omitMediaProcessingStatus,
} from '../shared/utils';
import { ACTIVITY_FAVORITE_ERROR_MESSAGES, ACTIVITY_MEDIA_PROCESSING_STATUS } from '../shared/const';
import type { MigratedActivity } from '../shared/types';
import { ACTIVITY_VISIBILITY } from '../shared/activity-visibility';

@Injectable()
export class ActivityWriteService {
  private readonly logger = new Logger('ActivityService');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountService) private readonly accountService: AccountService,
    @Inject(ActivityPersistenceService) private readonly persistenceService: ActivityPersistenceService,
    @Optional() @Inject(StorageService) private readonly storageService: StorageService | undefined,
    @Optional() @Inject(MediaCleanupService) private readonly mediaCleanupService: MediaCleanupService | undefined,
    @Optional() @Inject(StaticMapService) private readonly staticMapService: StaticMapService | undefined,
    @Inject(ActivityMediaService) private readonly mediaService: ActivityMediaService,
  ) {}

  async createActivity(activityDto: ActivityDto, id: string) {
    let uploadedRouteKey: string | undefined;
    let uploadedHeartRateKey: string | undefined;
    let uploadedMapKey: string | undefined;
    let uploadedRouteOnlyMapKey: string | undefined;
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
      const migratedActivity = activityDto as ActivityDto &
        Pick<MigratedActivity, 'heartRateSamples' | 'averageHeartRate' | 'minHeartRate' | 'maxHeartRate'>;
      const heartRateSamples = migratedActivity.heartRateSamples;
      if (heartRateSamples?.length && !storageService) {
        throw new ServiceUnavailableException('Сервис хранения данных пульса не настроен');
      }
      let media = activityDto.media;
      let activityId: string | undefined = media?.length ? randomUUID() : undefined;
      let routeMetadata;
      if (media?.some(({ assetId }) => assetId) && !storageService) {
        throw new ServiceUnavailableException('Сервис хранения проверяемого медиа не настроен');
      }
      if (!activityId && storageService && (locations?.length || heartRateSamples?.length)) activityId = randomUUID();
      if (storageService && (locations?.length || media?.length || heartRateSamples?.length)) {
        activityId ??= randomUUID();
        if (locations?.length) {
          routeMetadata = await storageService.uploadActivityRoute(id, activityId, locations);
          uploadedRouteKey = routeMetadata.key;
        }
        if (heartRateSamples?.length) {
          uploadedHeartRateKey = await storageService.uploadActivityHeartRateSamples(id, activityId, heartRateSamples);
        }
        if (media?.length) {
          const promotedMedia = await storageService.promoteActivityPhotos(id, activityId, media, mediaCreatedAt);
          media = promotedMedia.photos;
          uploadedActivityMediaKeys = promotedMedia.keys;
        }
      }
      uploadedRouteKey ??= routeMetadata?.key;

      const generatedMap = locations?.length
        ? this.staticMapService
          ? await this.staticMapService.generateActivityMap({
              userId: id,
              activityId,
              locations,
              hideMap: false,
            })
          : undefined
        : undefined;
      const generatedRouteOnlyMap =
        locations?.length && activityDto.hideMap
          ? await this.staticMapService?.generateActivityMap({
              userId: id,
              activityId,
              locations,
              hideMap: true,
            })
          : undefined;
      uploadedMapKey = generatedMap?.key;
      uploadedRouteOnlyMapKey = generatedRouteOnlyMap?.key;
      const mapPhotoUrl = locations?.length
        ? (generatedMap?.url ?? (this.staticMapService ? null : getMapBoxImage(locations)))
        : activityDto.mapPhotoUrl;
      const routeOnlyMapPhotoUrl = generatedRouteOnlyMap?.url ?? null;

      const mapPhotoUrlBlurhash = null;
      const activityFields = { ...activityDto } as Record<string, unknown>;
      const heartRateStatistics = heartRateSamples?.length ? getHeartRateStatistics(heartRateSamples) : {};
      delete activityFields.locations;
      delete activityFields.media;
      delete activityFields.heartRateSamples;
      delete activityFields.heartRateStorageKey;
      activityFields.visibility = activityDto.visibility ?? ACTIVITY_VISIBILITY.public;
      const description = activityDto.description?.trim() || null;

      const data = {
        ...(activityId ? { id: activityId } : {}),
        userId: id,
        profileId: `${account?.id}`,
        ...activityFields,
        ...heartRateStatistics,
        ...(migratedActivity.averageHeartRate !== undefined
          ? { averageHeartRate: migratedActivity.averageHeartRate }
          : {}),
        ...(migratedActivity.minHeartRate !== undefined ? { minHeartRate: migratedActivity.minHeartRate } : {}),
        ...(migratedActivity.maxHeartRate !== undefined ? { maxHeartRate: migratedActivity.maxHeartRate } : {}),
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
        ...(uploadedHeartRateKey ? { heartRateStorageKey: uploadedHeartRateKey } : {}),
        mapPhotoUrl,
        routeOnlyMapPhotoUrl,
        mapPhotoUrlBlurhash,
        mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued,
        caloriesActive: this.getWatchWorkoutCalories(activityDto, account),
      };
      const mediaCount = Array.isArray(media) ? media.length : 0;
      const locationCount = Array.isArray(activityDto.locations) ? activityDto.locations.length : 0;
      this.logger.log(
        `Сохранение активности: userId=${id}, sport=${activityDto.sport}, date=${activityDto.date}, media=${mediaCount}, locations=${locationCount}`,
      );

      const mediaRows = this.mediaService.getActivityMediaRows(activityId, id, activityDto.date ?? new Date(), media);
      const createdActivity = await this.persistenceService.create(data, mediaRows);
      await storageService?.refreshLinkedActivityMedia(
        media?.flatMap(({ assetId, thumbnailAssetId }) => [assetId, thumbnailAssetId]) ?? [],
      );
      return omitActivityHeartRateSamples(createdActivity);
    } catch (error) {
      await this.mediaService.deleteUploadedRoute(uploadedRouteKey);
      await this.mediaService.deleteUploadedRoute(uploadedHeartRateKey);
      await this.mediaService.deleteUploadedRoute(uploadedMapKey);
      await this.mediaService.deleteUploadedRoute(uploadedRouteOnlyMapKey);
      await Promise.all(uploadedActivityMediaKeys.map((key) => this.mediaService.deleteUploadedRoute(key)));
      handleServiceError(error);
    }
  }

  async updateActivity(activityDto: ActivityDto, id: string, userId = id) {
    try {
      const { date, description, emotion, visibility, hideMap, sport, title, distance, duration, speed } = activityDto;
      const account = await this.accountService.getAccountByUserId(userId);
      const existingActivity =
        hideMap !== undefined || activityDto.caloriesActive === undefined
          ? await this.prisma.activity.findFirst({
              where: { id, userId },
              select: {
                source: true,
                caloriesActive: true,
                hideMap: true,
                routeStorageKey: true,
                mapPhotoUrl: true,
                routeOnlyMapPhotoUrl: true,
              },
            })
          : null;
      const sourceCalories =
        existingActivity && ['strava', 'health-connect', 'healthkit'].includes(existingActivity.source ?? '')
          ? existingActivity.caloriesActive
          : null;
      let previousMapPhotoUrl: string | null = null;
      let previousRouteOnlyMapPhotoUrl: string | null = null;
      const data: Record<string, unknown> = {
        title,
        sport,
        visibility,
        emotion,
        date,
        description: description?.trim() || null,
        distance,
        duration,
        speed,
        caloriesActive:
          activityDto.caloriesActive ??
          sourceCalories ??
          calculateActiveCalories({
            weight: account?.weight,
            height: account?.height,
            age: account?.age,
            gender: account?.gender,
            sport,
            distance,
            duration,
          }),
      };

      if (hideMap !== undefined) {
        if (!existingActivity) throw new NotFoundException('Активность не найдена');
        data.hideMap = hideMap;

        // Legacy hidden activities only have the route-only image in mapPhotoUrl.
        const shouldGenerateFullMap =
          !existingActivity.mapPhotoUrl || (existingActivity.hideMap && !existingActivity.routeOnlyMapPhotoUrl);
        const shouldGenerateRouteOnlyMap = hideMap && !existingActivity.routeOnlyMapPhotoUrl;
        if (
          (shouldGenerateFullMap || shouldGenerateRouteOnlyMap) &&
          existingActivity.routeStorageKey &&
          this.storageService &&
          this.staticMapService
        ) {
          const locations = await this.storageService.readActivityRoute(existingActivity.routeStorageKey);
          const activityId = randomUUID();

          if (shouldGenerateFullMap) {
            const generatedMap = await this.staticMapService.generateActivityMap({
              userId,
              activityId,
              locations,
              hideMap: false,
            });
            if (generatedMap?.url) {
              previousMapPhotoUrl = existingActivity.mapPhotoUrl;
              data.mapPhotoUrl = generatedMap.url;
              data.mapPhotoUrlBlurhash = null;
              data.mediaProcessingStatus = ACTIVITY_MEDIA_PROCESSING_STATUS.queued;
            }
          }

          if (shouldGenerateRouteOnlyMap) {
            const generatedRouteOnlyMap = await this.staticMapService.generateActivityMap({
              userId,
              activityId,
              locations,
              hideMap: true,
            });
            if (generatedRouteOnlyMap?.url) {
              previousRouteOnlyMapPhotoUrl = existingActivity.routeOnlyMapPhotoUrl;
              data.routeOnlyMapPhotoUrl = generatedRouteOnlyMap.url;
            }
          }
        }
      }

      const activity = await this.persistenceService.update(id, userId, data);
      if ((previousMapPhotoUrl || previousRouteOnlyMapPhotoUrl) && this.mediaCleanupService) {
        const oldMapKeys = this.mediaService.getActivityStorageKeys(userId, {
          routeStorageKey: null,
          mapPhotoUrl: previousMapPhotoUrl,
          routeOnlyMapPhotoUrl: previousRouteOnlyMapPhotoUrl,
          media: [],
        });
        try {
          await Promise.all(
            [...oldMapKeys].map((storageKey) => this.mediaCleanupService!.enqueueObjectCleanup(userId, storageKey)),
          );
        } catch (error) {
          this.logger.error('Не удалось поставить старые файлы активности в очередь удаления', error);
        }
      }
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
      if (!this.mediaCleanupService) {
        const activity = await this.prisma.activity.findFirst({
          where: { id, userId },
          select: { media: { select: { mediaModerationAssetId: true, thumbnailModerationAssetId: true } } },
        });
        await this.storageService?.deleteActivityModerationAssets(
          userId,
          (activity?.media ?? []).flatMap(
            (media: { mediaModerationAssetId: string | null; thumbnailModerationAssetId: string | null }) => [
              media.mediaModerationAssetId,
              media.thumbnailModerationAssetId,
            ],
          ),
        );
        return await this.persistenceService.delete(id, userId);
      }

      const deletion = await this.prisma.$transaction(async (transaction) => {
        const activity = await transaction.activity.findFirst({
          where: { id, userId },
          select: {
            routeStorageKey: true,
            heartRateStorageKey: true,
            mapPhotoUrl: true,
            routeOnlyMapPhotoUrl: true,
            media: {
              select: {
                url: true,
                thumbnail: true,
                mediaModerationAssetId: true,
                thumbnailModerationAssetId: true,
              },
            },
          },
        });
        const storageKeys = this.mediaService.getActivityStorageKeys(userId, activity);
        await Promise.all(
          storageKeys.map((storageKey) =>
            this.mediaCleanupService!.enqueueObjectCleanup(userId, storageKey, transaction as never),
          ),
        );
        const deletedActivity = await transaction.activity.delete({ where: { id, userId } });
        return {
          deletedActivity,
          moderationAssetIds: (activity?.media ?? []).flatMap(
            (media: { mediaModerationAssetId: string | null; thumbnailModerationAssetId: string | null }) => [
              media.mediaModerationAssetId,
              media.thumbnailModerationAssetId,
            ],
          ),
        };
      });
      await this.storageService?.deleteActivityModerationAssets(userId, deletion.moderationAssetIds);
      return deletion.deletedActivity;
    } catch (error) {
      handleServiceError(error);
    }
  }

  getWatchWorkoutCalories(
    activity: Pick<ActivityDto, 'source' | 'caloriesActive' | 'sport' | 'distance' | 'duration'>,
    profile: Awaited<ReturnType<AccountService['getAccountByUserId']>>,
  ) {
    const caloriesActive = activity.caloriesActive;
    if (
      (activity.source === 'health-connect' || activity.source === 'healthkit') &&
      typeof caloriesActive === 'number' &&
      Number.isFinite(caloriesActive) &&
      caloriesActive >= 0
    ) {
      return Math.round(caloriesActive);
    }

    return calculateActiveCalories({
      weight: profile?.weight,
      height: profile?.height,
      age: profile?.age,
      gender: profile?.gender,
      sport: activity.sport,
      distance: activity.distance,
      duration: activity.duration,
    });
  }
}
