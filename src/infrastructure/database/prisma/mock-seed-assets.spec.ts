import { jest } from '@jest/globals';
import { S3Client } from '@aws-sdk/client-s3';
import { loadMockActivityTemplates } from './mock-seed-assets';

const environmentKeys = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL'] as const;
const originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));

function manifest() {
  const activities = Array.from({ length: 100 }, (_, index) => {
    const heartRate = index < 20;
    const number = String(index + 1).padStart(3, '0');
    return {
      title: null,
      description: null,
      sport: 'run',
      distance: 5_000,
      duration: 1_800_000,
      speed: 6,
      elevationGain: null,
      emotion: null,
      kilometresSplit: null,
      steps: null,
      locationName: null,
      weatherTemperature: null,
      weatherWindSpeed: null,
      weatherCode: null,
      caloriesActive: null,
      routeStorageKey: 'mock-activities/routes/' + number + '/route.json.gz',
      routeFormatVersion: 1,
      routePointCount: 10,
      routeSizeBytes: 100,
      routeChecksum: 'checksum-' + number,
      heartRateStorageKey: heartRate ? 'mock-activities/heart-rate/' + number + '/heart-rate-v1.json.gz' : null,
      averageHeartRate: heartRate ? 130 : null,
      minHeartRate: heartRate ? 90 : null,
      maxHeartRate: heartRate ? 160 : null,
      mapPhotoKey: 'mock-activities/maps/' + number + '/map.webp',
    };
  });
  return {
    version: 3,
    activityCount: 100,
    heartRateActivityCount: 20,
    routeOnlyActivityCount: 80,
    activities,
  };
}

function mockManifestResponse(value: unknown) {
  return jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
    Body: { transformToString: async () => JSON.stringify(value) },
  } as never);
}

describe('mock activity asset manifest', () => {
  beforeEach(() => {
    process.env.S3_ENDPOINT = 'https://s3.example';
    delete process.env.S3_REGION;
    process.env.S3_BUCKET = 'runich-stage';
    process.env.S3_ACCESS_KEY = 'test-access-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
    delete process.env.S3_PUBLIC_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of environmentKeys) {
      const value = originalEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('loads exactly 80 route-only and 20 heart-rate templates', async () => {
    const send = mockManifestResponse(manifest());

    const templates = await loadMockActivityTemplates();

    expect(templates).toHaveLength(100);
    expect(templates.filter((template) => template.heartRateStorageKey !== null)).toHaveLength(20);
    expect(templates.filter((template) => template.heartRateStorageKey === null)).toHaveLength(80);
    expect(templates[0].mapPhotoUrl).toBe('https://s3.example/runich-stage/mock-activities/maps/001/map.webp');
    expect(templates.every((template) => template.routeStorageKey && template.mapPhotoUrl)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects older manifest versions instead of synthesizing compatibility data', async () => {
    const legacy = { ...manifest(), version: 2 };
    mockManifestResponse(legacy);

    await expect(loadMockActivityTemplates()).rejects.toThrow(
      'Mock activity manifest must contain exactly 80 route-only and 20 heart-rate version 3 templates',
    );
  });

  it('requires configured S3 credentials', async () => {
    delete process.env.S3_ACCESS_KEY;

    await expect(loadMockActivityTemplates()).rejects.toThrow(
      'S3 credentials are required to load mock activity templates',
    );
  });
});
