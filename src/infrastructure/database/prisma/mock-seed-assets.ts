import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DEFAULT_S3_ENDPOINT, DEFAULT_S3_REGION } from 'src/storage/const';
import {
  MOCK_ACTIVITY_COUNT,
  MOCK_ACTIVITY_PHOTO_KEYS,
  MOCK_HEART_RATE_ACTIVITY_COUNT,
  MOCK_ROUTE_ONLY_ACTIVITY_COUNT,
} from './mock-seed.constants';

const MOCK_ACTIVITY_MANIFEST_KEY = 'mock-activities/manifest.json';
const MOCK_ACTIVITY_PREFIX = 'mock-activities/';
const MOCK_ACTIVITY_MANIFEST_VERSION = 3;

export type MockActivityTemplate = {
  title: string | null;
  description: string | null;
  sport: string;
  distance: number;
  duration: number;
  speed: number;
  elevationGain: number | null;
  emotion: string | null;
  kilometresSplit: unknown;
  steps: number | null;
  locationName: string | null;
  weatherTemperature: number | null;
  weatherWindSpeed: number | null;
  weatherCode: number | null;
  caloriesActive: number | null;
  routeStorageKey: string;
  routeFormatVersion: number;
  routePointCount: number;
  routeSizeBytes: number;
  routeChecksum: string;
  heartRateStorageKey: string | null;
  averageHeartRate: number | null;
  minHeartRate: number | null;
  maxHeartRate: number | null;
  mapPhotoUrl: string;
};

type MockActivityManifestEntry = Omit<MockActivityTemplate, 'mapPhotoUrl'> & { mapPhotoKey: string };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isMockActivityTemplate(value: unknown): value is MockActivityManifestEntry {
  if (!value || typeof value !== 'object') return false;
  const activity = value as Record<string, unknown>;
  const heartRateStorageKey = activity.heartRateStorageKey;
  const hasHeartRate = typeof heartRateStorageKey === 'string';
  const heartRateValid = hasHeartRate
    ? heartRateStorageKey.startsWith(MOCK_ACTIVITY_PREFIX + 'heart-rate/') &&
      isFiniteNumber(activity.averageHeartRate) &&
      isFiniteNumber(activity.minHeartRate) &&
      isFiniteNumber(activity.maxHeartRate)
    : activity.heartRateStorageKey === null &&
      activity.averageHeartRate === null &&
      activity.minHeartRate === null &&
      activity.maxHeartRate === null;

  return (
    typeof activity.sport === 'string' &&
    isFiniteNumber(activity.distance) &&
    activity.distance > 0 &&
    isFiniteNumber(activity.duration) &&
    activity.duration > 0 &&
    isFiniteNumber(activity.speed) &&
    nullableNumber(activity.elevationGain) &&
    (activity.title === null || typeof activity.title === 'string') &&
    (activity.description === null || typeof activity.description === 'string') &&
    (activity.emotion === null || typeof activity.emotion === 'string') &&
    (activity.locationName === null || typeof activity.locationName === 'string') &&
    nullableNumber(activity.steps) &&
    nullableNumber(activity.weatherTemperature) &&
    nullableNumber(activity.weatherWindSpeed) &&
    nullableNumber(activity.weatherCode) &&
    nullableNumber(activity.caloriesActive) &&
    typeof activity.routeStorageKey === 'string' &&
    activity.routeStorageKey.startsWith(MOCK_ACTIVITY_PREFIX + 'routes/') &&
    activity.routeFormatVersion === 1 &&
    isFiniteNumber(activity.routePointCount) &&
    activity.routePointCount > 0 &&
    isFiniteNumber(activity.routeSizeBytes) &&
    activity.routeSizeBytes > 0 &&
    typeof activity.routeChecksum === 'string' &&
    activity.routeChecksum.length > 0 &&
    typeof activity.mapPhotoKey === 'string' &&
    activity.mapPhotoKey.startsWith(MOCK_ACTIVITY_PREFIX + 'maps/') &&
    heartRateValid
  );
}

export function getPublicUrl(key: string) {
  const endpoint = process.env.S3_ENDPOINT?.trim() || DEFAULT_S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET?.trim() || '';
  const publicUrl = (process.env.S3_PUBLIC_URL?.trim() || endpoint + '/' + bucket).replace(/\/$/, '');
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return publicUrl + '/' + encodedKey;
}

export function getMockActivityPhotoUrls() {
  return MOCK_ACTIVITY_PHOTO_KEYS.map(getPublicUrl);
}

export async function loadMockActivityTemplates(): Promise<MockActivityTemplate[]> {
  const endpoint = process.env.S3_ENDPOINT?.trim() || DEFAULT_S3_ENDPOINT;
  const region = process.env.S3_REGION?.trim() || DEFAULT_S3_REGION;
  const bucket = process.env.S3_BUCKET?.trim() || '';
  const accessKey = process.env.S3_ACCESS_KEY?.trim() || '';
  const secretKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || '';
  if (!bucket || !accessKey || !secretKey) {
    throw new Error('S3 credentials are required to load mock activity templates');
  }

  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  try {
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: MOCK_ACTIVITY_MANIFEST_KEY }));
    if (!object.Body) throw new Error('Mock activity manifest is empty');

    const manifest = JSON.parse(await object.Body.transformToString()) as {
      version?: unknown;
      activityCount?: unknown;
      heartRateActivityCount?: unknown;
      routeOnlyActivityCount?: unknown;
      activities?: unknown;
    };
    if (
      manifest.version !== MOCK_ACTIVITY_MANIFEST_VERSION ||
      manifest.activityCount !== MOCK_ACTIVITY_COUNT ||
      manifest.heartRateActivityCount !== MOCK_HEART_RATE_ACTIVITY_COUNT ||
      manifest.routeOnlyActivityCount !== MOCK_ROUTE_ONLY_ACTIVITY_COUNT ||
      !Array.isArray(manifest.activities) ||
      manifest.activities.length !== MOCK_ACTIVITY_COUNT ||
      !manifest.activities.every(isMockActivityTemplate)
    ) {
      throw new Error(
        'Mock activity manifest must contain exactly 80 route-only and 20 heart-rate version 3 templates',
      );
    }

    const templates = manifest.activities as MockActivityManifestEntry[];
    const heartRateCount = templates.filter((activity) => activity.heartRateStorageKey !== null).length;
    const routeOnlyCount = templates.length - heartRateCount;
    if (heartRateCount !== MOCK_HEART_RATE_ACTIVITY_COUNT || routeOnlyCount !== MOCK_ROUTE_ONLY_ACTIVITY_COUNT) {
      throw new Error('Mock activity manifest must contain exactly 80 route-only and 20 heart-rate templates');
    }

    return templates.map(({ mapPhotoKey, ...template }) => ({
      ...template,
      mapPhotoUrl: getPublicUrl(mapPhotoKey),
    }));
  } finally {
    client.destroy();
  }
}
