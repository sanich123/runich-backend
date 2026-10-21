import { jest } from '@jest/globals';
import { seedMockActivities } from './mock-seed-activities';
import {
  MOCK_ACTIVITY_COUNT,
  MOCK_HEART_RATE_ACTIVITY_COUNT,
  MOCK_ROUTE_ONLY_ACTIVITY_COUNT,
} from './mock-seed.constants';
import type { DatabaseRepositories } from './database-repository';
import type { MockActivityTemplate } from './mock-seed-assets';
import type { MockUser, SeedUser } from './mock-seed.types';

describe('mock activity seed templates', () => {
  it('seeds 80 route-only activities and 20 route plus heart-rate activities per mock user', async () => {
    const createdActivities: Record<string, unknown>[] = [];
    const activityCreateMany = jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      createdActivities.push(...data);
      return { count: data.length };
    });
    const noOpCreateMany = jest.fn(async () => ({ count: 0 }));
    const prisma = {
      activity: { createMany: activityCreateMany },
      activityMedia: { createMany: noOpCreateMany },
      like: { createMany: noOpCreateMany },
      comment: { createMany: noOpCreateMany },
      commentLike: { createMany: noOpCreateMany },
    } as unknown as DatabaseRepositories;
    const user: MockUser = {
      id: 'mock-user',
      email: 'mock@example.com',
      profile: { id: 'mock-profile' },
    };
    const templates: MockActivityTemplate[] = Array.from({ length: MOCK_ACTIVITY_COUNT }, (_, index) => {
      const hasHeartRate = index < MOCK_HEART_RATE_ACTIVITY_COUNT;
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
        routeStorageKey: 'mock-activities/routes/' + String(index + 1).padStart(3, '0') + '/route.json.gz',
        routeFormatVersion: 1,
        routePointCount: 10,
        routeSizeBytes: 100,
        routeChecksum: 'checksum-' + index,
        heartRateStorageKey: hasHeartRate
          ? 'mock-activities/heart-rate/' + String(index + 1).padStart(3, '0') + '/heart-rate-v1.json.gz'
          : null,
        averageHeartRate: hasHeartRate ? 130 : null,
        minHeartRate: hasHeartRate ? 90 : null,
        maxHeartRate: hasHeartRate ? 160 : null,
        mapPhotoUrl: 'https://s3.example/mock-activities/maps/' + String(index + 1).padStart(3, '0') + '/map.webp',
      };
    });

    const result = await seedMockActivities(prisma, [user], [user as SeedUser], templates, [
      'https://s3.example/mock-activities/photos/photo-01.jpg',
    ]);

    const pulseActivities = createdActivities.filter((activity) => activity.heartRateStorageKey !== null);
    const routeOnlyActivities = createdActivities.filter((activity) => activity.heartRateStorageKey === null);

    expect(result.activityTotal).toBe(MOCK_ACTIVITY_COUNT);
    expect(createdActivities).toHaveLength(MOCK_ACTIVITY_COUNT);
    expect(pulseActivities).toHaveLength(MOCK_HEART_RATE_ACTIVITY_COUNT);
    expect(routeOnlyActivities).toHaveLength(MOCK_ROUTE_ONLY_ACTIVITY_COUNT);
    expect(
      createdActivities.every(
        (activity) => typeof activity.routeStorageKey === 'string' && typeof activity.mapPhotoUrl === 'string',
      ),
    ).toBe(true);
    expect(
      routeOnlyActivities.every(
        (activity) =>
          activity.averageHeartRate === null && activity.minHeartRate === null && activity.maxHeartRate === null,
      ),
    ).toBe(true);
  });
});
