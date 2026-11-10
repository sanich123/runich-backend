import { Inject, Injectable, Optional, Logger } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { MediaCleanupService } from 'src/storage/services/media-cleanup.service';
import { StaticMapService } from 'src/common/maps/static-map.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ActivityDto, type ActivityMediaObject, type LocationObject } from '../dto/activity.dto';
import { handleServiceError } from 'src/common/utils/database-errors';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { ACTIVITY_MEDIA_PROCESSING_STATUS } from '../shared/const';
import type { ActivityMediaWithModerationReferences, MigratedActivity } from '../shared/types';
import { getElevationGainFromKilometreSplits, getElevationGainFromLocations } from '../shared/utils';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';

@Injectable()
export class ActivityMediaService {
  private readonly logger = new Logger('ActivityService');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
    @Optional() @Inject(MediaCleanupService) private readonly mediaCleanupService?: MediaCleanupService,
    @Optional() @Inject(StaticMapService) private readonly staticMapService?: StaticMapService,
  ) {}

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
      const createdMedia = await this.prisma.$transaction(async (transaction) => {
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
        const createdRows = [];
        for (const data of rows) createdRows.push(await transaction.activityMedia.create({ data }));
        await transaction.activity.update({
          where: { id: activityId },
          data: { mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued },
        });
        return createdRows;
      });
      await this.storageService.refreshLinkedActivityMedia(
        promoted.photos.flatMap(({ assetId, thumbnailAssetId }) => [assetId, thumbnailAssetId]),
      );
      const refreshedMedia = await this.prisma.activityMedia.findMany({
        where: { id: { in: createdMedia.map(({ id }) => id) } },
        orderBy: { position: 'asc' },
      });
      const mediaForResponse = await Promise.all(
        refreshedMedia.map(async (media: ActivityMediaWithModerationReferences) => {
          const { mediaModerationAssetId, thumbnailModerationAssetId, ...responseMedia } = media;
          const [url, thumbnail] = await Promise.all([
            media.url
              ? Promise.resolve(media.url)
              : mediaModerationAssetId
                ? this.storageService!.getOwnerModerationPreviewUrl(userId, mediaModerationAssetId)
                : Promise.resolve(null),
            media.thumbnail
              ? Promise.resolve(media.thumbnail)
              : thumbnailModerationAssetId
                ? this.storageService!.getOwnerModerationPreviewUrl(userId, thumbnailModerationAssetId)
                : Promise.resolve(null),
          ]);
          return { ...responseMedia, ...(url ? { url } : {}), ...(thumbnail ? { thumbnail } : {}) };
        }),
      );
      return { success: true, media: mediaForResponse };
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

      const media = await this.prisma.activityMedia.findFirst({
        where: { id: mediaId, activityId, userId },
        select: {
          url: true,
          thumbnail: true,
          mediaModerationAssetId: true,
          thumbnailModerationAssetId: true,
        },
      });
      if (!media) throw new NotFoundException('Медиа активности не найдено');
      await this.prisma.$transaction(async (transaction) => {
        const storageKeys = this.getMediaStorageKeys(userId, media);
        await Promise.all(
          storageKeys.map((storageKey) =>
            this.mediaCleanupService!.enqueueObjectCleanup(userId, storageKey, transaction as never),
          ),
        );
        await transaction.activityMedia.delete({ where: { id: mediaId } });
      });
      await this.storageService.deleteActivityModerationAssets(userId, [
        media.mediaModerationAssetId,
        media.thumbnailModerationAssetId,
      ]);

      return { success: true };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async uploadRawActivityLocations(id: string, currentUserId: string, locations: LocationObject[]) {
    const activity = await this.prisma.activity.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!activity) throw new NotFoundException('Активность не найдена');
    if (activity.userId !== currentUserId) throw new ForbiddenException('Нельзя загрузить маршрут чужой активности');
    if (!this.storageService) throw new ServiceUnavailableException('Сервис хранения маршрутов не настроен');

    const routeMetadata = await this.storageService.uploadActivityRoute(activity.userId, id, locations);
    await this.prisma.activity.update({
      where: { id },
      data: {
        routeStorageKey: routeMetadata.key,
        routeFormatVersion: routeMetadata.formatVersion,
        routePointCount: routeMetadata.pointCount,
        routeSizeBytes: routeMetadata.sizeBytes,
        routeChecksum: routeMetadata.checksum,
      },
    });
  }

  async prepareActivityRoute<
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
    const importedActivity = activity as T & Pick<MigratedActivity, 'heartRateSamples'>;
    const heartRateSamples = importedActivity.heartRateSamples;
    if (heartRateSamples?.length && !this.storageService) {
      throw new ServiceUnavailableException('Сервис хранения данных пульса не настроен');
    }

    const activityId = 'id' in activity && typeof activity.id === 'string' ? activity.id : randomUUID();
    let routeKey: string | undefined;
    let heartRateKey: string | undefined;
    let mapKey: string | undefined;
    let routeOnlyMapKey: string | undefined;

    try {
      if (heartRateSamples?.length && this.storageService) {
        heartRateKey = await this.storageService.uploadActivityHeartRateSamples(
          activity.userId,
          activityId,
          heartRateSamples,
        );
      }

      const routeMetadata =
        activity.locations?.length && this.storageService
          ? await this.storageService.uploadActivityRoute(activity.userId, activityId, activity.locations)
          : undefined;
      routeKey = routeMetadata?.key;
      const generatedMap =
        activity.locations?.length && this.staticMapService
          ? await this.staticMapService.generateActivityMap({
              userId: activity.userId,
              activityId,
              locations: activity.locations,
              hideMap: false,
            })
          : undefined;
      mapKey = generatedMap?.key;
      const generatedRouteOnlyMap =
        activity.locations?.length && activity.hideMap
          ? await this.staticMapService?.generateActivityMap({
              userId: activity.userId,
              activityId,
              locations: activity.locations,
              hideMap: true,
            })
          : undefined;
      routeOnlyMapKey = generatedRouteOnlyMap?.key;

      const dataWithoutLocations = { ...activity } as unknown as Record<string, unknown>;
      delete dataWithoutLocations.locations;
      delete dataWithoutLocations.sourceElevationGain;
      delete dataWithoutLocations.heartRateSamples;
      delete dataWithoutLocations.heartRateStorageKey;
      if (importedActivity.heartRateSamples !== undefined) {
        dataWithoutLocations.heartRateStorageKey = heartRateKey ?? null;
      }

      return {
        data: {
          ...dataWithoutLocations,
          elevationGain,
          id: activityId,
          ...(routeMetadata
            ? {
                routeStorageKey: routeMetadata.key,
                routeFormatVersion: routeMetadata.formatVersion,
                routePointCount: routeMetadata.pointCount,
                routeSizeBytes: routeMetadata.sizeBytes,
                routeChecksum: routeMetadata.checksum,
              }
            : {}),
          ...(activity.locations?.length
            ? {
                mapPhotoUrl: generatedMap?.url ?? (this.staticMapService ? null : getMapBoxImage(activity.locations)),
                routeOnlyMapPhotoUrl: generatedRouteOnlyMap?.url ?? null,
              }
            : {}),
        },
        routeKey,
        heartRateKey,
        mapKey,
        routeOnlyMapKey,
      };
    } catch (error) {
      await Promise.all([routeKey, heartRateKey, mapKey, routeOnlyMapKey].map((key) => this.deleteUploadedRoute(key)));
      throw error;
    }
  }

  async deleteUploadedRoute(routeKey?: string) {
    if (!routeKey || !this.storageService) return;
    try {
      await this.storageService.deleteObjectByKey(routeKey);
    } catch (error) {
      this.logger.error(`Не удалось удалить незавершённый маршрут ${routeKey}`, error);
    }
  }

  getActivityStorageKeys(
    userId: string,
    activity: {
      routeStorageKey: string | null;
      heartRateStorageKey?: string | null;
      mapPhotoUrl?: string | null;
      routeOnlyMapPhotoUrl?: string | null;
      media: unknown;
    } | null,
  ) {
    const keys = new Set<string>();
    if (activity?.routeStorageKey?.startsWith(`${userId}/`)) keys.add(activity.routeStorageKey);
    if (activity?.heartRateStorageKey?.startsWith(`${userId}/`)) keys.add(activity.heartRateStorageKey);

    if (this.storageService && activity?.mapPhotoUrl) {
      try {
        keys.add(this.storageService.getOwnedKey(userId, activity.mapPhotoUrl));
      } catch {
        // Mapbox and other external URLs are intentionally not deleted here.
      }
    }

    if (this.storageService && activity?.routeOnlyMapPhotoUrl) {
      try {
        keys.add(this.storageService.getOwnedKey(userId, activity.routeOnlyMapPhotoUrl));
      } catch {
        // External URLs are intentionally not deleted here.
      }
    }

    if (Array.isArray(activity?.media)) {
      for (const media of activity.media) {
        for (const key of this.getMediaStorageKeys(userId, media)) keys.add(key);
      }
    }
    return [...keys];
  }

  getMediaStorageKeys(userId: string, media: unknown) {
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

  getMediaUrls(media: unknown) {
    if (typeof media === 'string') return [media];
    if (!media || typeof media !== 'object') return [];

    return ['url' in media ? media.url : undefined, 'thumbnail' in media ? media.thumbnail : undefined].filter(
      (url): url is string => typeof url === 'string',
    );
  }

  getActivityMediaRows(
    activityId: unknown,
    userId: unknown,
    activityDate: unknown,
    media: unknown,
  ): Record<string, unknown>[] {
    if (typeof activityId !== 'string' || typeof userId !== 'string') return [];
    if (!(activityDate instanceof Date) && typeof activityDate !== 'string') return [];
    if (!Array.isArray(media)) return [];

    return media.flatMap((item, position): Record<string, unknown>[] => {
      if (typeof item === 'string') {
        return [{ activityId, userId, activityDate, position, url: item, thumbnail: null, blurhash: null }];
      }
      if (!item || typeof item !== 'object') return [];
      const photo = item as ActivityMediaObject;
      if (photo.assetId) {
        return [
          {
            activityId,
            userId,
            activityDate,
            position,
            url: photo.url ?? null,
            thumbnail: photo.thumbnail ?? null,
            blurhash: photo.blurhash ?? null,
            mediaModerationAssetId: photo.assetId,
            thumbnailModerationAssetId: photo.thumbnailAssetId ?? null,
            mediaReviewStatus: photo.mediaReviewStatus ?? 'queued',
          },
        ];
      }
      if (typeof photo.url !== 'string') return [];
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
