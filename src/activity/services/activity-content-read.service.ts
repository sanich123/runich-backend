import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { ActivityAccessService } from './activity-access.service';
import { reduceLocations } from 'src/common/parsers/reduce-locations';
import { handleServiceError } from 'src/common/utils/database-errors';
import { ActivityHeartRateSampleObject, LocationObject } from '../dto/activity.dto';
import { ACTIVITY_DETAILS_SELECT, MAX_MAP_ROUTE_LOCATIONS } from '../shared/const';
import { encodeActivityMediaCursor, type ActivityMediaCursor } from '../shared/activity.pagination';
import {
  createActivityChartLocations,
  hidePendingActivityMediaForViewer,
  hideActivityMapForViewer,
  normalizeActivityDetails,
  reduceActivityChartHeartRateSamples,
} from '../shared/utils';

@Injectable()
export class ActivityContentReadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ActivityAccessService) private readonly accessService: ActivityAccessService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
  ) {}

  async getLocationsByActivityId(id: string, currentUserId?: string, raw = false) {
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
      const storedLocations = await this.storageService.readActivityRoute(activity.routeStorageKey);
      locations = raw && isOwner ? storedLocations : reduceLocations(storedLocations, MAX_MAP_ROUTE_LOCATIONS);
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

  async resolveActivityMediaForViewer<T extends Record<string, unknown>>(activity: T, viewerId?: string) {
    if (!Array.isArray(activity.media)) return activity;
    const ownerId = typeof activity.userId === 'string' ? activity.userId : '';
    return {
      ...activity,
      media: await this.resolveMediaForViewer(activity.media, ownerId, viewerId),
    } as T;
  }

  async resolveMediaForViewer(mediaItems: unknown[], ownerId: string, viewerId?: string) {
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
}
