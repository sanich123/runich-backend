import type { ActivityKilometreSplitObject, LocationObject } from 'src/activity/activity.dto';

const EARTH_RADIUS_METERS = 6_371_008.8;
const METERS_IN_KILOMETER = 1_000;
const ELEVATION_SMOOTHING_WINDOW = 5;
const MAX_ALTITUDE_ACCURACY_METERS = 15;
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

function getReliableAltitude(location: LocationObject) {
  const { altitude, altitudeAccuracy, mocked } = location.coords;

  if (!isFiniteNumber(altitude)) return null;

  if (isFiniteNumber(altitudeAccuracy) && (altitudeAccuracy < 0 || altitudeAccuracy > MAX_ALTITUDE_ACCURACY_METERS)) {
    return null;
  }

  if (mocked === true) return null;

  return altitude;
}

function getSmoothedLocations(locations: LocationObject[]) {
  const reliableLocations = locations.filter((location) => getReliableAltitude(location) !== null);
  if (reliableLocations.length < 2) return [];

  const halfWindow = Math.floor(ELEVATION_SMOOTHING_WINDOW / 2);

  return reliableLocations.map((location, index) => {
    const values = reliableLocations
      .slice(Math.max(0, index - halfWindow), Math.min(reliableLocations.length, index + halfWindow + 1))
      .map((item) => getReliableAltitude(item) as number);

    return {
      ...location,
      coords: {
        ...location.coords,
        altitude: median(values),
      },
    };
  });
}

function isPlausibleElevationChange(first: LocationObject, second: LocationObject, elevationDelta: number) {
  const firstTimestamp = first.coords.timestamp;
  const secondTimestamp = second.coords.timestamp;
  if (!isFiniteNumber(firstTimestamp) || !isFiniteNumber(secondTimestamp)) return true;

  const elapsedSeconds = (secondTimestamp - firstTimestamp) / 1_000;
  return elapsedSeconds <= 0 || Math.abs(elevationDelta) <= elapsedSeconds * MAX_VERTICAL_SPEED_METERS_PER_SECOND;
}

function addElevationChangeToKilometres(
  elevationChangeByKilometre: (number | null)[],
  startDistance: number,
  segmentDistance: number,
  elevationChange: number,
) {
  if (!elevationChangeByKilometre.length || segmentDistance <= 0 || !Number.isFinite(elevationChange)) {
    return;
  }

  const segmentEnd = startDistance + segmentDistance;
  let processedDistance = startDistance;

  while (processedDistance < segmentEnd) {
    const kilometreIndex = Math.floor(processedDistance / METERS_IN_KILOMETER);
    const kilometreEnd = (kilometreIndex + 1) * METERS_IN_KILOMETER;
    const distanceInKilometre = Math.min(segmentEnd, kilometreEnd) - processedDistance;

    if (kilometreIndex >= elevationChangeByKilometre.length) {
      break;
    }

    elevationChangeByKilometre[kilometreIndex] =
      (elevationChangeByKilometre[kilometreIndex] ?? 0) + elevationChange * (distanceInKilometre / segmentDistance);
    processedDistance += distanceInKilometre;
  }
}

function getElevationChangesByKilometre(locations: LocationObject[], kilometreCount: number, distanceScale = 1) {
  const smoothedLocations = getSmoothedLocations(locations);
  const elevationChangeByKilometre = Array.from(
    { length: Math.max(0, Math.floor(kilometreCount)) },
    () => null as number | null,
  );

  if (smoothedLocations.length < 2 || !elevationChangeByKilometre.length) {
    return elevationChangeByKilometre;
  }

  const distances = [0];
  for (let index = 1; index < smoothedLocations.length; index += 1) {
    distances.push(
      distances[index - 1] + distanceBetween(smoothedLocations[index - 1], smoothedLocations[index]) * distanceScale,
    );
  }

  elevationChangeByKilometre.fill(0);
  for (let index = 1; index < smoothedLocations.length; index += 1) {
    const previous = smoothedLocations[index - 1];
    const current = smoothedLocations[index];
    const previousAltitude = getReliableAltitude(previous) as number;
    const currentAltitude = getReliableAltitude(current) as number;
    const elevationChange = currentAltitude - previousAltitude;

    if (!isPlausibleElevationChange(previous, current, elevationChange)) {
      continue;
    }

    addElevationChangeToKilometres(
      elevationChangeByKilometre,
      distances[index - 1],
      distances[index] - distances[index - 1],
      elevationChange,
    );
  }

  return elevationChangeByKilometre;
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
  declaredDistance?: number,
): ActivityKilometreSplitObject[] {
  const validLocations = locations.filter(
    ({ coords }) => isFiniteNumber(coords.latitude) && isFiniteNumber(coords.longitude),
  );
  if (validLocations.length < 2) return [];

  const geometricSegmentDistances = validLocations
    .slice(1)
    .map((location, index) => distanceBetween(validLocations[index], location));
  const geometricTotalDistance = geometricSegmentDistances.reduce((sum, distance) => sum + distance, 0);
  if (geometricTotalDistance <= 0) return [];

  const hasDeclaredDistance = isFiniteNumber(declaredDistance) && declaredDistance >= 0;
  if (hasDeclaredDistance && declaredDistance === 0) return [];
  const distanceScale = hasDeclaredDistance ? declaredDistance / geometricTotalDistance : 1;
  const segmentDistances = geometricSegmentDistances.map((distance) => distance * distanceScale);
  const totalDistance = segmentDistances.reduce((sum, distance) => sum + distance, 0);

  const firstTimestamp = validLocations[0].coords.timestamp;
  const lastTimestamp = validLocations.at(-1)?.coords.timestamp;
  const timestampSpan =
    isFiniteNumber(firstTimestamp) && isFiniteNumber(lastTimestamp) ? Math.max(0, lastTimestamp - firstTimestamp) : 0;
  const timestampScale =
    timestampSpan > Math.max(0, totalDuration) && timestampSpan > 0 ? Math.max(0, totalDuration) / timestampSpan : 1;
  const splits: ActivityKilometreSplitObject[] = [];
  let distanceInCurrentKilometer = 0;
  let durationInCurrentKilometer = 0;

  segmentDistances.forEach((segmentDistance, index) => {
    const first = validLocations[index];
    const second = validLocations[index + 1];
    const timestampDuration =
      isFiniteNumber(first.coords.timestamp) && isFiniteNumber(second.coords.timestamp)
        ? Math.max(0, second.coords.timestamp - first.coords.timestamp) * timestampScale
        : 0;
    let segmentDuration = timestampDuration || (Math.max(0, totalDuration) * segmentDistance) / totalDistance;
    let remainingDistance = segmentDistance;
    let processedDistance = 0;

    while (distanceInCurrentKilometer + remainingDistance >= METERS_IN_KILOMETER) {
      const distanceToSplit = METERS_IN_KILOMETER - distanceInCurrentKilometer;
      const fraction = remainingDistance > 0 ? distanceToSplit / remainingDistance : 0;
      const splitDuration = segmentDuration * fraction;

      splits.push({
        lastKilometerDuration: durationInCurrentKilometer + splitDuration,
        lastKilometerAltitude: 0,
        kilometerPoint: interpolateLocation(first, second, (processedDistance + distanceToSplit) / segmentDistance),
      });

      processedDistance += distanceToSplit;
      remainingDistance -= distanceToSplit;
      segmentDuration -= splitDuration;
      distanceInCurrentKilometer = 0;
      durationInCurrentKilometer = 0;
    }

    distanceInCurrentKilometer += remainingDistance;
    durationInCurrentKilometer += segmentDuration;
  });

  const elevationChangesByKilometre = getElevationChangesByKilometre(validLocations, splits.length, distanceScale);

  return splits.map((split, index) => ({
    ...split,
    lastKilometerAltitude: elevationChangesByKilometre[index] ?? 0,
  }));
}
