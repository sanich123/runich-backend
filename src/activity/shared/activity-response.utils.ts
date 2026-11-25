import { getElevationGainFromKilometreSplits } from './activity-route.utils';

export function omitMediaProcessingStatus(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = { ...(value as Record<string, unknown>) };
  delete result.mediaProcessingStatus;
  return result;
}

export function omitActivityHeartRateSamples(value: unknown) {
  const result = omitMediaProcessingStatus(value);
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  delete (result as Record<string, unknown>).heartRateSamples;
  delete (result as Record<string, unknown>).heartRateStorageKey;
  return result;
}
export function normalizeActivityCard<T extends Record<string, unknown>>(activity: T) {
  const hasElevationData = Object.hasOwn(activity, 'elevationGain') || Object.hasOwn(activity, 'kilometresSplit');
  const { kilometresSplit, elevationGain, ...activityWithoutSplit } = activity;
  if (!hasElevationData) return activity;
  return {
    ...activityWithoutSplit,
    elevationGain:
      typeof elevationGain === 'number' && Number.isFinite(elevationGain)
        ? elevationGain
        : getElevationGainFromKilometreSplits(kilometresSplit),
  };
}

export function hideActivityMapForViewer<T extends Record<string, unknown>>(activity: T, viewerId?: string) {
  const isOwner = typeof viewerId === 'string' && activity.userId === viewerId;
  if (isOwner || activity.hideMap !== true) return activity;

  const kilometresSplit = activity.kilometresSplit;
  const kilometresSplitWithoutLocations = Array.isArray(kilometresSplit)
    ? kilometresSplit.map((split) => {
        if (!split || typeof split !== 'object' || Array.isArray(split)) return split;
        const splitWithoutLocation = { ...(split as Record<string, unknown>) };
        delete splitWithoutLocation.kilometerPoint;
        return splitWithoutLocation;
      })
    : undefined;

  return {
    ...activity,
    mapPhotoUrl: null,
    mapPhotoUrlBlurhash: null,
    ...(Array.isArray(kilometresSplit) ? { kilometresSplit: kilometresSplitWithoutLocations } : {}),
  };
}

export function normalizeActivityCardForViewer<T extends Record<string, unknown>>(activity: T, viewerId?: string): T {
  const activityWithoutPendingMedia = hidePendingActivityTextForViewer(
    hidePendingActivityMediaForViewer(activity, viewerId),
    viewerId,
  );
  const normalizedActivity = hideActivityMapForViewer(normalizeActivityCard(activityWithoutPendingMedia), viewerId);
  const profile = normalizedActivity.profile as { allowActivityElevationViewing?: boolean } | undefined;
  const isOwner = typeof viewerId === 'string' && normalizedActivity.userId === viewerId;
  if (isOwner || profile?.allowActivityElevationViewing !== false) return normalizedActivity as T;
  return { ...normalizedActivity, elevationGain: null } as T;
}

export function hidePendingActivityTextForViewer<T extends Record<string, unknown>>(activity: T, viewerId?: string) {
  const isOwner = typeof viewerId === 'string' && activity.userId === viewerId;
  const status = activity.textModerationStatus;
  if (isOwner || status === undefined || status === null || status === 'visible') return activity;
  return { ...activity, title: null, description: null };
}

export function hidePendingActivityMediaForViewer<T extends Record<string, unknown>>(activity: T, viewerId?: string) {
  if (!Array.isArray(activity.media)) return activity;
  const isOwner = typeof viewerId === 'string' && activity.userId === viewerId;

  return {
    ...activity,
    media: activity.media.flatMap((media: unknown) => {
      if (media === null || typeof media !== 'object' || Array.isArray(media)) return [];
      const safeMedia = { ...(media as Record<string, unknown>) };
      const mediaAssetId = safeMedia.mediaModerationAssetId;
      delete safeMedia.mediaModerationAssetId;
      delete safeMedia.thumbnailModerationAssetId;
      if (isOwner) return [safeMedia];

      const isLegacyPublicMedia =
        !mediaAssetId &&
        (safeMedia.mediaReviewStatus === null || safeMedia.mediaReviewStatus === undefined) &&
        typeof safeMedia.url === 'string';
      if (safeMedia.mediaReviewStatus === 'approved' || isLegacyPublicMedia) return [safeMedia];
      if (safeMedia.mediaReviewStatus === 'rejected' || safeMedia.mediaReviewStatus === 'failed') return [];
      if (typeof safeMedia.mediaReviewStatus !== 'string') return [];
      return [{ ...safeMedia, url: null, thumbnail: null }];
    }),
  } as T;
}
export function normalizeActivityDetails<T extends Record<string, unknown>>(activity: T) {
  if (!Object.hasOwn(activity, 'elevationGain') && !Object.hasOwn(activity, 'kilometresSplit')) return activity;
  if (typeof activity.elevationGain === 'number' && Number.isFinite(activity.elevationGain)) return activity;
  return {
    ...activity,
    elevationGain: getElevationGainFromKilometreSplits(activity.kilometresSplit),
  };
}
