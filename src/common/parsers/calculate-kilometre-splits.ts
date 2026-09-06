import type { ActivityKilometreSplitObject, LocationObject } from 'src/activity/activity.dto';

const EARTH_RADIUS_METERS = 6_371_008.8;
const METERS_IN_KILOMETER = 1_000;
const ELEVATION_SMOOTHING_WINDOW = 5;
// Imported FIT/GPX/TCX altitude streams are already smoothed, but their
// useful elevation changes are often smaller than the 10 m threshold used by
// the live tracker. Keep a smaller threshold here so short climbs are not
// discarded completely while the smoothing and descent hysteresis still
// suppress GPS noise.
const MIN_CLIMB_METERS = 2;
const MAX_VERTICAL_SPEED_METERS_PER_SECOND = 3;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceBetween(first: LocationObject, second: LocationObject) {
  const latitudeDelta = toRadians(second.coords.latitude - first.coords.latitude);
  const longitudeDelta = toRadians(second.coords.longitude - first.coords.longitude);
  const firstLatitude = toRadians(first.coords.latitude);
  const secondLatitude = toRadians(second.coords.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function getSmoothedAltitudes(locations: LocationObject[]) {
  const halfWindow = Math.floor(ELEVATION_SMOOTHING_WINDOW / 2);

  return locations.map((location, index) => {
    const values = locations
      .slice(Math.max(0, index - halfWindow), Math.min(locations.length, index + halfWindow + 1))
      .map(({ coords }) => coords.altitude)
      .filter(isFiniteNumber);

    return values.length ? median(values) : null;
  });
}

function isPlausibleElevationChange(first: LocationObject, second: LocationObject, elevationDelta: number) {
  const firstTimestamp = first.coords.timestamp;
  const secondTimestamp = second.coords.timestamp;
  if (!isFiniteNumber(firstTimestamp) || !isFiniteNumber(secondTimestamp)) return true;

  const elapsedSeconds = (secondTimestamp - firstTimestamp) / 1_000;
  return elapsedSeconds <= 0 || Math.abs(elevationDelta) <= elapsedSeconds * MAX_VERTICAL_SPEED_METERS_PER_SECOND;
}

/**
 * Filters short GPS elevation noise while preserving positive climbs that reach
 * the same 10 m threshold used by the mobile tracker.
 */
function getElevationGains(locations: LocationObject[]) {
  const smoothedAltitudes = getSmoothedAltitudes(locations);
  const segmentGains = Array.from({ length: Math.max(0, locations.length - 1) }, () => 0);
  let climbStartAltitude: number | null = null;
  let peakAltitude: number | null = null;
  let pendingGains: Array<{ segmentIndex: number; value: number }> = [];

  const commitClimb = () => {
    if (climbStartAltitude === null || peakAltitude === null || peakAltitude - climbStartAltitude < MIN_CLIMB_METERS) {
      pendingGains = [];
      return;
    }

    pendingGains.forEach(({ segmentIndex, value }) => {
      segmentGains[segmentIndex] += value;
    });
    pendingGains = [];
  };

  const resetClimb = (altitude: number | null) => {
    climbStartAltitude = altitude;
    peakAltitude = altitude;
    pendingGains = [];
  };

  for (let index = 1; index < locations.length; index += 1) {
    const previousAltitude = smoothedAltitudes[index - 1];
    const currentAltitude = smoothedAltitudes[index];

    if (previousAltitude === null || currentAltitude === null) {
      commitClimb();
      resetClimb(currentAltitude);
      continue;
    }

    const elevationDelta = currentAltitude - previousAltitude;
    if (!isPlausibleElevationChange(locations[index - 1], locations[index], elevationDelta)) continue;

    if (climbStartAltitude === null || peakAltitude === null) resetClimb(previousAltitude);

    if (currentAltitude >= (peakAltitude as number)) {
      const gain = currentAltitude - (peakAltitude as number);
      if (gain > 0) pendingGains.push({ segmentIndex: index - 1, value: gain });
      peakAltitude = currentAltitude;
      continue;
    }

    if ((peakAltitude as number) - currentAltitude > 3) {
      commitClimb();
      resetClimb(currentAltitude);
    }
  }

  commitClimb();
  return segmentGains;
}

function interpolateLocation(first: LocationObject, second: LocationObject, fraction: number): LocationObject {
  const clampedFraction = Math.min(1, Math.max(0, fraction));
  const interpolate = (firstValue: number, secondValue: number) =>
    firstValue + (secondValue - firstValue) * clampedFraction;
  const firstAltitude = first.coords.altitude;
  const secondAltitude = second.coords.altitude;
  const firstTimestamp = first.coords.timestamp;
  const secondTimestamp = second.coords.timestamp;

  return {
    coords: {
      latitude: interpolate(first.coords.latitude, second.coords.latitude),
      longitude: interpolate(first.coords.longitude, second.coords.longitude),
      ...(isFiniteNumber(firstAltitude) && isFiniteNumber(secondAltitude)
        ? { altitude: interpolate(firstAltitude, secondAltitude) }
        : isFiniteNumber(secondAltitude)
          ? { altitude: secondAltitude }
          : isFiniteNumber(firstAltitude)
            ? { altitude: firstAltitude }
            : {}),
      ...(isFiniteNumber(firstTimestamp) && isFiniteNumber(secondTimestamp)
        ? { timestamp: interpolate(firstTimestamp, secondTimestamp) }
        : isFiniteNumber(secondTimestamp)
          ? { timestamp: secondTimestamp }
          : isFiniteNumber(firstTimestamp)
            ? { timestamp: firstTimestamp }
            : {}),
    },
  };
}

export function calculateKilometreSplits(
  locations: LocationObject[],
  totalDuration: number,
): ActivityKilometreSplitObject[] {
  const validLocations = locations.filter(
    ({ coords }) => isFiniteNumber(coords.latitude) && isFiniteNumber(coords.longitude),
  );
  if (validLocations.length < 2) return [];

  const segmentDistances = validLocations
    .slice(1)
    .map((location, index) => distanceBetween(validLocations[index], location));
  const totalDistance = segmentDistances.reduce((sum, distance) => sum + distance, 0);
  if (totalDistance <= 0) return [];

  const elevationGains = getElevationGains(validLocations);
  const firstTimestamp = validLocations[0].coords.timestamp;
  const lastTimestamp = validLocations.at(-1)?.coords.timestamp;
  const timestampSpan =
    isFiniteNumber(firstTimestamp) && isFiniteNumber(lastTimestamp) ? Math.max(0, lastTimestamp - firstTimestamp) : 0;
  const timestampScale =
    timestampSpan > Math.max(0, totalDuration) && timestampSpan > 0 ? Math.max(0, totalDuration) / timestampSpan : 1;
  const splits: ActivityKilometreSplitObject[] = [];
  let distanceInCurrentKilometer = 0;
  let durationInCurrentKilometer = 0;
  let altitudeInCurrentKilometer = 0;

  segmentDistances.forEach((segmentDistance, index) => {
    const first = validLocations[index];
    const second = validLocations[index + 1];
    const timestampDuration =
      isFiniteNumber(first.coords.timestamp) && isFiniteNumber(second.coords.timestamp)
        ? Math.max(0, second.coords.timestamp - first.coords.timestamp) * timestampScale
        : 0;
    let segmentDuration = timestampDuration || (Math.max(0, totalDuration) * segmentDistance) / totalDistance;
    let remainingDistance = segmentDistance;
    let remainingAltitude = elevationGains[index];
    let processedDistance = 0;

    while (distanceInCurrentKilometer + remainingDistance >= METERS_IN_KILOMETER) {
      const distanceToSplit = METERS_IN_KILOMETER - distanceInCurrentKilometer;
      const fraction = remainingDistance > 0 ? distanceToSplit / remainingDistance : 0;
      const splitDuration = segmentDuration * fraction;
      const splitAltitude = remainingAltitude * fraction;

      splits.push({
        lastKilometerDuration: durationInCurrentKilometer + splitDuration,
        lastKilometerAltitude: altitudeInCurrentKilometer + splitAltitude,
        kilometerPoint: interpolateLocation(first, second, (processedDistance + distanceToSplit) / segmentDistance),
      });

      processedDistance += distanceToSplit;
      remainingDistance -= distanceToSplit;
      segmentDuration -= splitDuration;
      remainingAltitude -= splitAltitude;
      distanceInCurrentKilometer = 0;
      durationInCurrentKilometer = 0;
      altitudeInCurrentKilometer = 0;
    }

    distanceInCurrentKilometer += remainingDistance;
    durationInCurrentKilometer += segmentDuration;
    altitudeInCurrentKilometer += remainingAltitude;
  });

  return splits;
}
