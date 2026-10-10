import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DEFAULT_S3_ENDPOINT, DEFAULT_S3_REGION } from 'src/storage/const';
import { MOCK_ACTIVITY_PHOTO_KEYS } from './mock-seed.constants';

const MOCK_ACTIVITY_MANIFEST_KEY = 'mock-activities/manifest.json';
const MOCK_ACTIVITY_PREFIX = 'mock-activities/';

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
  routeChecksum: string | null;
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

  return (
    typeof activity.sport === 'string' &&
    isFiniteNumber(activity.distance) &&
    isFiniteNumber(activity.duration) &&
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
    isFiniteNumber(activity.routeFormatVersion) &&
    isFiniteNumber(activity.routePointCount) &&
    isFiniteNumber(activity.routeSizeBytes) &&
    (activity.routeChecksum === null || typeof activity.routeChecksum === 'string') &&
    typeof activity.mapPhotoKey === 'string' &&
    activity.mapPhotoKey.startsWith(MOCK_ACTIVITY_PREFIX + 'maps/')
  );
}

export function getPublicUrl(key: string) {
  const endpoint = process.env.S3_ENDPOINT?.trim() || DEFAULT_S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET?.trim() || '';
  const publicUrl = (process.env.S3_PUBLIC_URL?.trim() || `${endpoint}/${bucket}`).replace(/\/$/, '');
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${publicUrl}/${encodedKey}`;
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
  if (!bucket || !accessKey || !secretKey) return [];

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

    const manifest = JSON.parse(await object.Body.transformToString()) as { version?: unknown; activities?: unknown };
    if (manifest.version !== 1 || !Array.isArray(manifest.activities) || manifest.activities.length < 100) {
      throw new Error('Mock activity manifest has an unsupported shape');
    }

    const templates = manifest.activities.slice(0, 100);
    if (!templates.every(isMockActivityTemplate)) throw new Error('Mock activity manifest contains invalid entries');

    return templates.map(({ mapPhotoKey, ...template }) => ({ ...template, mapPhotoUrl: getPublicUrl(mapPhotoKey) }));
  } catch (error) {
    const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const errorName = (error as { name?: string }).name;
    if (statusCode === 404 || errorName === 'NoSuchKey' || errorName === 'NotFound') return [];
    throw error;
  } finally {
    client.destroy();
  }
}
