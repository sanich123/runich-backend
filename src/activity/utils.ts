export function omitMediaProcessingStatus(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = { ...(value as Record<string, unknown>) };
  delete result.mediaProcessingStatus;
  return result;
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

function getReliableAltitude(location: LocationWithElevation) {
  if (!location || typeof location !== 'object') return null;
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
    (location): location is LocationWithElevation =>
      Boolean(location && typeof location === 'object') &&
      getReliableAltitude(location as LocationWithElevation) !== null,
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

export function normalizeActivityDetails<T extends Record<string, unknown>>(activity: T) {
  if (!Object.hasOwn(activity, 'elevationGain') && !Object.hasOwn(activity, 'kilometresSplit')) return activity;
  if (typeof activity.elevationGain === 'number' && Number.isFinite(activity.elevationGain)) return activity;
  return {
    ...activity,
    elevationGain: getElevationGainFromKilometreSplits(activity.kilometresSplit),
  };
}
