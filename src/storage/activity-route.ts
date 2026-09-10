import { createHash } from 'node:crypto';
import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { LocationObject } from 'src/activity/activity.dto';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const ACTIVITY_ROUTE_FORMAT_VERSION = 1;

type CompactRoutePoint = [
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  boolean | null,
];

type StoredActivityRoute = {
  version: typeof ACTIVITY_ROUTE_FORMAT_VERSION;
  locations: CompactRoutePoint[];
};

export async function encodeActivityRoute(locations: LocationObject[]) {
  const route: StoredActivityRoute = {
    version: ACTIVITY_ROUTE_FORMAT_VERSION,
    locations: locations.map((location) => {
      const coords = location.coords;
      return [
        coords.latitude,
        coords.longitude,
        location.timestamp ?? coords.timestamp ?? null,
        coords.altitude ?? null,
        coords.accuracy ?? null,
        coords.altitudeAccuracy ?? null,
        coords.heading ?? null,
        coords.speed ?? null,
        coords.mocked ?? null,
      ];
    }),
  };
  const body = await gzipAsync(Buffer.from(JSON.stringify(route), 'utf8'));

  return {
    body,
    metadata: {
      formatVersion: ACTIVITY_ROUTE_FORMAT_VERSION,
      pointCount: locations.length,
      sizeBytes: body.byteLength,
      checksum: createHash('sha256').update(body).digest('hex'),
    },
  };
}

export async function decodeActivityRoute(body: Uint8Array): Promise<LocationObject[]> {
  const parsed = JSON.parse((await gunzipAsync(Buffer.from(body))).toString('utf8')) as StoredActivityRoute;
  if (parsed.version !== ACTIVITY_ROUTE_FORMAT_VERSION || !Array.isArray(parsed.locations)) {
    throw new Error('Неизвестный формат маршрута активности');
  }

  return parsed.locations.map(
    ([latitude, longitude, timestamp, altitude, accuracy, altitudeAccuracy, heading, speed, mocked]) => ({
      ...(timestamp === null ? {} : { timestamp }),
      coords: {
        latitude,
        longitude,
        ...(altitude === null ? {} : { altitude }),
        ...(accuracy === null ? {} : { accuracy }),
        ...(altitudeAccuracy === null ? {} : { altitudeAccuracy }),
        ...(heading === null ? {} : { heading }),
        ...(speed === null ? {} : { speed }),
        ...(mocked === null ? {} : { mocked }),
      },
    }),
  );
}

export function getActivityRouteKey(userId: string, activityId: string) {
  return `${userId}/activities/${activityId}/route-v${ACTIVITY_ROUTE_FORMAT_VERSION}.json.gz`;
}
