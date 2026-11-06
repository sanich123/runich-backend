import type { ActivityChartLocationObject, ActivityHeartRateSampleObject, LocationObject } from '../dto/activity.dto';
import { DEFAULT_TIME_ZONE, getLocalDateTimeParts } from 'src/common/utils/time-zone';
import type { ActivityCaloriesInput, ActivityName, TimeOfDay } from './types';

// Keep this aligned with CHART_POINT_COUNT in the Runich client.
const ACTIVITY_CHART_HEART_RATE_POINT_COUNT = 81;

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

function interpolateHeartRateAt(samples: ActivityHeartRateSampleObject[], timestamp: number): number {
  if (timestamp <= samples[0].timestamp) return samples[0].beatsPerMinute;

  for (let index = 1; index < samples.length; index += 1) {
    const right = samples[index];
    if (timestamp > right.timestamp) continue;
    const left = samples[index - 1];
    const span = right.timestamp - left.timestamp;
    if (span <= 0) return right.beatsPerMinute;
    const fraction = (timestamp - left.timestamp) / span;
    return left.beatsPerMinute + (right.beatsPerMinute - left.beatsPerMinute) * fraction;
  }

  return samples[samples.length - 1].beatsPerMinute;
}

export function reduceActivityChartHeartRateSamples(
  samples: ActivityHeartRateSampleObject[],
  locations: ActivityChartLocationObject[] | null,
): ActivityHeartRateSampleObject[] {
  const firstLocationTimestamp = locations?.[0]?.timestamp;
  const lastLocationTimestamp = locations?.[locations.length - 1]?.timestamp;
  const hasChartTimeRange =
    typeof firstLocationTimestamp === 'number' &&
    Number.isFinite(firstLocationTimestamp) &&
    typeof lastLocationTimestamp === 'number' &&
    Number.isFinite(lastLocationTimestamp) &&
    lastLocationTimestamp > firstLocationTimestamp;
  const chartSamples = samples
    .filter(
      (sample) =>
        Number.isFinite(sample.timestamp) &&
        Number.isFinite(sample.beatsPerMinute) &&
        sample.beatsPerMinute >= 1 &&
        sample.beatsPerMinute <= 300 &&
        (!hasChartTimeRange ||
          (sample.timestamp >= firstLocationTimestamp && sample.timestamp <= lastLocationTimestamp)),
    )
    .sort((first, second) => first.timestamp - second.timestamp);

  if (chartSamples.length <= ACTIVITY_CHART_HEART_RATE_POINT_COUNT) return chartSamples;

  const rangeStart = hasChartTimeRange ? firstLocationTimestamp : chartSamples[0].timestamp;
  const rangeEnd = hasChartTimeRange ? lastLocationTimestamp : chartSamples[chartSamples.length - 1].timestamp;
  if (rangeEnd <= rangeStart) return chartSamples.slice(0, ACTIVITY_CHART_HEART_RATE_POINT_COUNT);

  return Array.from({ length: ACTIVITY_CHART_HEART_RATE_POINT_COUNT }, (_, index) => {
    const timestamp = rangeStart + ((rangeEnd - rangeStart) * index) / (ACTIVITY_CHART_HEART_RATE_POINT_COUNT - 1);
    return {
      timestamp,
      beatsPerMinute: interpolateHeartRateAt(chartSamples, timestamp),
    };
  });
}

export function getElevationGainFromKilometreSplits(value: unknown) {
  if (!Array.isArray(value)) return 0;

  return value.reduce((total, split) => {
    if (!split || typeof split !== 'object') return total;
    const altitude = (split as { lastKilometerAltitude?: unknown }).lastKilometerAltitude;
    return typeof altitude === 'number' && Number.isFinite(altitude) ? total + Math.max(0, altitude) : total;
  }, 0);
}

const MIN_ELEVATION_DELTA_METERS = 10;
const MAX_ALTITUDE_ACCURACY_METERS = 15;
const MAX_VERTICAL_SPEED_METERS_PER_SECOND = 3;
const ELEVATION_SMOOTHING_WINDOW = 5;

type LocationWithElevation = {
  coords?: {
    altitude?: unknown;
    altitudeAccuracy?: unknown;
    timestamp?: unknown;
    mocked?: unknown;
  };
  timestamp?: unknown;
  mocked?: unknown;
};

function getReliableAltitude(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const location = value as LocationWithElevation;
  const altitude = location.coords?.altitude;
  const altitudeAccuracy = location.coords?.altitudeAccuracy;
  if (typeof altitude !== 'number' || !Number.isFinite(altitude)) return null;
  if (
    typeof altitudeAccuracy === 'number' &&
    Number.isFinite(altitudeAccuracy) &&
    (altitudeAccuracy < 0 || altitudeAccuracy > MAX_ALTITUDE_ACCURACY_METERS)
  ) {
    return null;
  }
  if (location.mocked === true || location.coords?.mocked === true) return null;
  return altitude;
}

function isPlausibleVerticalChange(previous: LocationWithElevation, current: LocationWithElevation, delta: number) {
  const previousTimestamp = previous.timestamp ?? previous.coords?.timestamp;
  const currentTimestamp = current.timestamp ?? current.coords?.timestamp;
  if (typeof previousTimestamp !== 'number' || typeof currentTimestamp !== 'number') return true;
  const elapsedSeconds = (currentTimestamp - previousTimestamp) / 1_000;
  return elapsedSeconds <= 0 || Math.abs(delta) <= elapsedSeconds * MAX_VERTICAL_SPEED_METERS_PER_SECOND;
}

export function getElevationGainFromLocations(value: unknown) {
  if (!Array.isArray(value)) return 0;

  const reliableLocations = (value as unknown[]).filter(
    (location): location is LocationWithElevation => getReliableAltitude(location) !== null,
  );
  if (reliableLocations.length < 2) return 0;

  const halfWindow = Math.floor(ELEVATION_SMOOTHING_WINDOW / 2);
  const smoothedLocations = reliableLocations.map((location, index) => {
    const altitudes = reliableLocations
      .slice(Math.max(0, index - halfWindow), Math.min(reliableLocations.length, index + halfWindow + 1))
      .map((item) => getReliableAltitude(item) as number)
      .sort((first, second) => first - second);
    return { location, altitude: altitudes[Math.floor(altitudes.length / 2)] };
  });

  let elevationGain = 0;
  let climbStart = smoothedLocations[0].altitude;
  let peak = climbStart;
  for (let index = 1; index < smoothedLocations.length; index += 1) {
    const current = smoothedLocations[index];
    if (current.altitude >= peak) {
      peak = current.altitude;
      continue;
    }

    const descentFromPeak = peak - current.altitude;
    if (descentFromPeak > 3) {
      const climb = peak - climbStart;
      const previous = smoothedLocations[index - 1];
      if (
        climb >= MIN_ELEVATION_DELTA_METERS &&
        isPlausibleVerticalChange(previous.location, current.location, current.altitude - previous.altitude)
      ) {
        elevationGain += climb;
      }
      climbStart = current.altitude;
      peak = current.altitude;
    }
  }

  const finalClimb = peak - climbStart;
  if (finalClimb >= MIN_ELEVATION_DELTA_METERS) elevationGain += finalClimb;
  return elevationGain;
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

export function normalizeActivityCardForViewer<T extends Record<string, unknown>>(activity: T, viewerId?: string) {
  const activityWithoutPendingMedia = hidePendingActivityMediaForViewer(activity, viewerId);
  const normalizedActivity = hideActivityMapForViewer(normalizeActivityCard(activityWithoutPendingMedia), viewerId);
  const profile = normalizedActivity.profile as { allowActivityElevationViewing?: boolean } | undefined;
  const isOwner = typeof viewerId === 'string' && normalizedActivity.userId === viewerId;
  if (isOwner || profile?.allowActivityElevationViewing !== false) return normalizedActivity;
  return { ...normalizedActivity, elevationGain: null };
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

function getDistanceBetweenLocations(first: LocationObject, second: LocationObject) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDifference = ((second.coords.latitude - first.coords.latitude) * Math.PI) / 180;
  const longitudeDifference = ((second.coords.longitude - first.coords.longitude) * Math.PI) / 180;
  const firstLatitude = (first.coords.latitude * Math.PI) / 180;
  const secondLatitude = (second.coords.latitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDifference / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function createActivityChartLocations(
  locations: LocationObject[],
  activityDistance: number,
  canViewPace: boolean,
  canViewElevation: boolean,
): ActivityChartLocationObject[] {
  const timedLocations = locations
    .flatMap((location) => {
      const timestamp = location.timestamp ?? location.coords.timestamp;
      return typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0
        ? [{ location, timestamp }]
        : [];
    })
    .sort((first, second) => first.timestamp - second.timestamp);
  const routeDistance = timedLocations.reduce((totalDistance, { location }, index) => {
    if (index === 0) return totalDistance;
    return totalDistance + getDistanceBetweenLocations(timedLocations[index - 1].location, location);
  }, 0);
  const distanceScale = activityDistance > 0 && routeDistance > 0 ? activityDistance / routeDistance : 1;

  return timedLocations.map(({ location, timestamp }, index) => {
    const previousLocation = timedLocations[index - 1];
    const elapsedSeconds = previousLocation ? (timestamp - previousLocation.timestamp) / 1000 : 0;
    const segmentDistance = previousLocation
      ? getDistanceBetweenLocations(previousLocation.location, location) * distanceScale
      : 0;
    const speedKilometresPerHour = elapsedSeconds > 0 ? (segmentDistance / elapsedSeconds) * 3.6 : 0;
    const canExposeSpeed = canViewPace && speedKilometresPerHour >= 0.5 && speedKilometresPerHour <= 126;
    const altitude = location.coords.altitude;
    return {
      timestamp,
      coords: {
        ...(canViewElevation && typeof altitude === 'number' && Number.isFinite(altitude) ? { altitude } : {}),
        ...(typeof location.coords.timestamp === 'number' ? { timestamp: location.coords.timestamp } : {}),
        ...(canExposeSpeed ? { speed: speedKilometresPerHour } : {}),
      },
    };
  });
}

export function normalizeActivityDetails<T extends Record<string, unknown>>(activity: T) {
  if (!Object.hasOwn(activity, 'elevationGain') && !Object.hasOwn(activity, 'kilometresSplit')) return activity;
  if (typeof activity.elevationGain === 'number' && Number.isFinite(activity.elevationGain)) return activity;
  return {
    ...activity,
    elevationGain: getElevationGainFromKilometreSplits(activity.kilometresSplit),
  };
}

export function getMediaProcessingErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const MIN_REASONABLE_WEIGHT_KG = 20;
const MAX_REASONABLE_WEIGHT_KG = 200;
const MILLISECONDS_IN_HOUR = 60 * 60 * 1000;

/**
 * Calculates active calories with a standard MET estimate.
 * The result is intentionally null when the profile does not contain the metrics required by the estimate.
 */
export function calculateActiveCalories({
  weight,
  height,
  age,
  gender,
  sport,
  distance,
  duration,
}: ActivityCaloriesInput) {
  const weightKg = parseWeight(weight);
  const heightCm = parseNumberInRange(height, 100, 230);
  const ageYears = parseNumberInRange(age, 13, 100);
  const genderConstant = getGenderConstant(gender);
  if (
    weightKg === null ||
    heightCm === null ||
    ageYears === null ||
    genderConstant === null ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return null;
  }

  const durationMinutes = duration / 60_000;
  const speedKmh = distance / 1000 / (duration / MILLISECONDS_IN_HOUR);
  const met = getActivityMet(sport, speedKmh);
  const basalMetabolicRate = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + genderConstant;
  const calories = (basalMetabolicRate / 1440) * (met - 1) * durationMinutes;

  return Number.isFinite(calories) ? Math.max(0, Math.round(calories)) : null;
}

function parseWeight(weight: string | number | null | undefined) {
  return parseNumberInRange(weight, MIN_REASONABLE_WEIGHT_KG, MAX_REASONABLE_WEIGHT_KG);
}

function parseNumberInRange(value: string | number | null | undefined, min: number, max: number) {
  const numericValue = typeof value === 'number' ? value : Number(value?.replace(',', '.').trim());
  if (!Number.isFinite(numericValue) || numericValue < min || numericValue > max) return null;
  return numericValue;
}

function getGenderConstant(gender: string | null | undefined) {
  const normalizedGender = gender?.trim().toLocaleLowerCase();
  if (normalizedGender === 'male' || normalizedGender === 'мужчина') return 5;
  if (normalizedGender === 'female' || normalizedGender === 'женщина') return -161;
  return null;
}

function getActivityMet(sport: string, speedKmh: number) {
  const normalizedSport = sport.trim().toLocaleLowerCase();

  if (normalizedSport.includes('run') || normalizedSport.includes('бег')) return getRunningMet(speedKmh);
  if (normalizedSport.includes('walk') || normalizedSport.includes('ход')) return getWalkingMet(speedKmh);
  if (
    normalizedSport.includes('ride') ||
    normalizedSport.includes('bike') ||
    normalizedSport.includes('cycl') ||
    normalizedSport.includes('вел')
  ) {
    return getCyclingMet(speedKmh);
  }
  if (normalizedSport.includes('swim') || normalizedSport.includes('плав')) return 8;
  if (normalizedSport.includes('hike') || normalizedSport.includes('trek') || normalizedSport.includes('поход'))
    return 6;
  if (normalizedSport.includes('yoga') || normalizedSport.includes('йог')) return 3;
  if (normalizedSport.includes('workout') || normalizedSport.includes('трен')) return 5;

  return 5;
}

function getRunningMet(speedKmh: number) {
  if (speedKmh < 6.4) return 6;
  if (speedKmh < 8) return 8.3;
  if (speedKmh < 9.7) return 9.8;
  if (speedKmh < 11.3) return 11;
  if (speedKmh < 12.9) return 11.8;
  if (speedKmh < 14.5) return 12.8;
  return 14.5;
}

function getWalkingMet(speedKmh: number) {
  if (speedKmh < 3.2) return 2.8;
  if (speedKmh < 4.8) return 3.5;
  if (speedKmh < 5.6) return 4.3;
  if (speedKmh < 6.4) return 5;
  return 6.3;
}

function getCyclingMet(speedKmh: number) {
  if (speedKmh < 16) return 4;
  if (speedKmh < 19) return 6.8;
  if (speedKmh < 22) return 8;
  if (speedKmh < 25) return 10;
  return 12;
}

// Общепринятые границы: ночь — 00:00–05:59, утро — 06:00–11:59,
// день — 12:00–17:59, вечер — 18:00–23:59.
const timeOfDay: TimeOfDay[] = [
  {
    untilHour: 6,
    adjectives: { masculine: 'Ночной', feminine: 'Ночная', neuter: 'Ночное' },
  },
  {
    untilHour: 12,
    adjectives: { masculine: 'Утренний', feminine: 'Утренняя', neuter: 'Утреннее' },
  },
  {
    untilHour: 18,
    adjectives: { masculine: 'Дневной', feminine: 'Дневная', neuter: 'Дневное' },
  },
  {
    untilHour: 24,
    adjectives: { masculine: 'Вечерний', feminine: 'Вечерняя', neuter: 'Вечернее' },
  },
];

function getActivityName(sport: string): ActivityName {
  const normalizedSport = sport.trim().toLocaleLowerCase();

  if (normalizedSport.includes('run') || normalizedSport.includes('бег')) {
    return { name: 'бег', gender: 'masculine' };
  }

  if (normalizedSport.includes('walk') || normalizedSport.includes('ход')) {
    return { name: 'ходьба', gender: 'feminine' };
  }

  if (
    normalizedSport.includes('ride') ||
    normalizedSport.includes('bike') ||
    normalizedSport.includes('cycl') ||
    normalizedSport.includes('вел')
  ) {
    return { name: 'велозаезд', gender: 'masculine' };
  }

  if (normalizedSport.includes('swim') || normalizedSport.includes('плав')) {
    return { name: 'плавание', gender: 'neuter' };
  }

  if (normalizedSport.includes('yoga') || normalizedSport.includes('йог')) {
    return { name: 'йога', gender: 'feminine' };
  }

  if (normalizedSport.includes('hike') || normalizedSport.includes('trek') || normalizedSport.includes('поход')) {
    return { name: 'поход', gender: 'masculine' };
  }

  if (normalizedSport.includes('ski') || normalizedSport.includes('лыж')) {
    return { name: 'лыжная прогулка', gender: 'feminine' };
  }

  return { name: 'тренировка', gender: 'feminine' };
}

function getActivityHour(date?: Date | string, timeZone = DEFAULT_TIME_ZONE) {
  if (!date) return getLocalDateTimeParts(new Date(), timeZone).hour;

  const parsedDate = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsedDate.getTime())
    ? getLocalDateTimeParts(new Date(), timeZone).hour
    : getLocalDateTimeParts(parsedDate, timeZone).hour;
}

export function generateActivityTitle(sport: string, date?: Date | string, timeZone = DEFAULT_TIME_ZONE) {
  const hour = getActivityHour(date, timeZone);
  const period = timeOfDay.find(({ untilHour }) => hour < untilHour) ?? timeOfDay[0];
  const activityName = getActivityName(sport);

  return `${period.adjectives[activityName.gender]} ${activityName.name}`;
}

export function getHeartRateStatistics(samples: readonly ActivityHeartRateSampleObject[]) {
  if (samples.length === 0) {
    return { averageHeartRate: null, minHeartRate: null, maxHeartRate: null };
  }

  const values = samples.map(({ beatsPerMinute }) => beatsPerMinute);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    averageHeartRate: Math.round(sum / values.length),
    minHeartRate: Math.min(...values),
    maxHeartRate: Math.max(...values),
  };
}
