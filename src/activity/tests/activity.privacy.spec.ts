import { ActivityService } from '../activity.service';
import { asyncMock } from 'src/tests/helpers';

function createPrismaMock() {
  return {
    activity: {
      findUnique: asyncMock(),
      findMany: asyncMock(),
    },
    activityMedia: { findMany: asyncMock() },
    friend: { findUnique: asyncMock() },
    profile: { findUnique: asyncMock() },
  };
}

describe('ActivityService privacy', () => {
  it('limits another user to public activities, photos and locations', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.activityMedia.findMany.mockResolvedValue([]);
    prisma.profile.findUnique.mockResolvedValue({ hideProfilePhotos: false });
    prisma.activity.findUnique.mockResolvedValue({
      userId: 'owner-1',
      visibility: 'private',
      kilometresSplit: [],
    });

    await service.getActivitesByUserId('owner-1', '10', undefined, 'viewer-1');
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'owner-1', visibility: 'public' } }),
    );

    await service.getMediaByUserId('owner-1', '10', undefined, 'viewer-1');
    expect(prisma.activityMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'owner-1', activity: { visibility: 'public' } },
      }),
    );

    await expect(service.getLocationsByActivityId('activity-1', 'viewer-1')).resolves.toBeNull();
  });

  it('allows an owner to read private activity locations', async () => {
    const prisma = createPrismaMock();
    const storage = { readActivityRoute: asyncMock().mockResolvedValue([{ coords: { latitude: 55, longitude: 37 } }]) };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never);
    const locations = [{ coords: { latitude: 55, longitude: 37 } }];
    prisma.activity.findUnique.mockResolvedValue({
      userId: 'owner-1',
      visibility: 'private',
      routeStorageKey: 'owner-1/activities/activity-1/locations/locations-v1.json.gz',
      kilometresSplit: [],
    });

    await expect(service.getLocationsByActivityId('activity-1', 'owner-1')).resolves.toEqual({
      locations,
      kilometresSplit: [],
    });
    expect(storage.readActivityRoute).toHaveBeenCalledWith(
      'owner-1/activities/activity-1/locations/locations-v1.json.gz',
    );
  });

  it('hides route replay locations from external viewers when disabled by the owner', async () => {
    const prisma = createPrismaMock();
    const storage = { readActivityRoute: asyncMock() };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never);
    prisma.activity.findUnique.mockResolvedValue({
      userId: 'owner-1',
      visibility: 'public',
      profile: { allowActivityReplayViewing: false },
      routeStorageKey: 'owner-1/activities/activity-1/locations/locations-v1.json.gz',
      kilometresSplit: [],
    });

    await expect(service.getLocationsByActivityId('activity-1', 'viewer-1')).resolves.toBeNull();
    expect(storage.readActivityRoute).not.toHaveBeenCalled();
  });

  it('hides a private activity detail from another user', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue({ userId: 'owner-1', visibility: 'private' });

    await expect(service.getActivityByActivityId('activity-1', 'viewer-1')).resolves.toBeNull();
  });

  it('allows followers visibility only to users who follow the owner', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue({ userId: 'owner-1', visibility: 'followers' });
    prisma.friend.findUnique.mockResolvedValue({ id: 'follow-1' });

    await expect(service.canAccessActivity('activity-1', 'viewer-1')).resolves.toBe(true);
    expect(prisma.friend.findUnique).toHaveBeenCalledWith({
      where: { userId_friendId: { userId: 'viewer-1', friendId: 'owner-1' } },
      select: { id: true },
    });

    prisma.friend.findUnique.mockResolvedValue(null);
    await expect(service.canAccessActivity('activity-1', 'other-viewer')).resolves.toBe(false);
  });

  it('hides the profile photo gallery from other users but keeps it available to its owner', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.profile.findUnique.mockResolvedValue({ hideProfilePhotos: true });
    prisma.activityMedia.findMany.mockResolvedValue([
      {
        id: 'media-1',
        activityId: 'activity-1',
        activityDate: new Date('2026-10-01T12:00:00.000Z'),
        position: 0,
        url: 'https://cdn.example/photo.jpg',
        thumbnail: null,
        blurhash: 'hash',
      },
    ]);

    await expect(service.getMediaByUserId('owner-1', '4', undefined, 'viewer-1')).resolves.toEqual({
      media: [],
      hasMore: false,
      nextCursor: null,
      isLastPage: true,
    });
    expect(prisma.activityMedia.findMany).not.toHaveBeenCalled();
    expect(prisma.profile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'owner-1' },
      select: { hideProfilePhotos: true },
    });

    await expect(service.getMediaByUserId('owner-1', '4', undefined, 'owner-1')).resolves.toMatchObject({
      media: [
        {
          id: 'media-1',
          activityId: 'activity-1',
          url: 'https://cdn.example/photo.jpg',
          thumbnail: null,
          blurhash: 'hash',
        },
      ],
    });
    expect(prisma.profile.findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns only enabled chart metrics and does not couple chart pace to route replay privacy', async () => {
    const prisma = createPrismaMock();
    const storage = {
      readActivityRoute: asyncMock().mockResolvedValue([
        { timestamp: 1_000, coords: { latitude: 0, longitude: 0, altitude: 100, timestamp: 1_000 } },
        { timestamp: 61_000, coords: { latitude: 0, longitude: 0.001, altitude: 110, timestamp: 61_000 } },
      ]),
    };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never);
    prisma.activity.findUnique.mockResolvedValue({
      userId: 'owner-1',
      visibility: 'public',
      routeStorageKey: 'owner-1/activities/activity-1/locations/locations-v1.json.gz',
      distance: 111,
      heartRateSamples: [{ timestamp: 30_000, beatsPerMinute: 130 }],
      profile: {
        allowActivityReplayViewing: false,
        allowActivityHeartRateViewing: false,
        allowActivityElevationViewing: true,
        allowActivityPaceViewing: true,
      },
    });

    const chart = await service.getChartDataByActivityId('activity-1', 'viewer-1');

    expect(chart).toEqual({
      heartRateSamples: [],
      locations: [
        { timestamp: 1_000, coords: { altitude: 100, timestamp: 1_000 } },
        expect.objectContaining({
          timestamp: 61_000,
          coords: expect.objectContaining({ altitude: 110, speed: expect.any(Number) }),
        }),
      ],
    });
    expect(chart?.locations?.[0]?.coords).not.toHaveProperty('latitude');
    expect(chart?.locations?.[0]?.coords).not.toHaveProperty('longitude');
    expect(storage.readActivityRoute).toHaveBeenCalledTimes(1);
  });

  it('does not return chart data when fewer than two metrics are visible', async () => {
    const prisma = createPrismaMock();
    const storage = { readActivityRoute: asyncMock() };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never);
    prisma.activity.findUnique.mockResolvedValue({
      userId: 'owner-1',
      visibility: 'public',
      routeStorageKey: 'owner-1/activities/activity-1/locations/locations-v1.json.gz',
      profile: {
        allowActivityHeartRateViewing: false,
        allowActivityElevationViewing: false,
        allowActivityPaceViewing: true,
      },
      heartRateSamples: [{ timestamp: 30_000, beatsPerMinute: 130 }],
    });

    await expect(service.getChartDataByActivityId('activity-1', 'viewer-1')).resolves.toEqual({
      heartRateSamples: [],
      locations: null,
    });
    expect(storage.readActivityRoute).not.toHaveBeenCalled();
  });

  it('redacts heart rate and elevation summaries from activity details for external viewers', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue({
      id: 'activity-1',
      userId: 'owner-1',
      visibility: 'public',
      elevationGain: 88,
      kilometresSplit: [],
      averageHeartRate: 135,
      minHeartRate: 80,
      maxHeartRate: 160,
      profile: {
        allowActivityHeartRateViewing: false,
        allowActivityElevationViewing: false,
        allowActivityPaceViewing: true,
      },
    });

    await expect(service.getActivityByActivityId('activity-1', 'viewer-1')).resolves.toMatchObject({
      averageHeartRate: null,
      minHeartRate: null,
      maxHeartRate: null,
      elevationGain: null,
    });
    await expect(service.getActivityByActivityId('activity-1', 'owner-1')).resolves.toMatchObject({
      averageHeartRate: 135,
      minHeartRate: 80,
      maxHeartRate: 160,
      elevationGain: 88,
    });
  });

  it('blocks activity likes and comments only for external users when disabled', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue({
      userId: 'owner-1',
      profile: { allowActivityInteractions: false },
    });

    await expect(service.canInteractWithActivity('activity-1', 'viewer-1')).resolves.toBe(false);
    await expect(service.canInteractWithActivity('activity-1', 'owner-1')).resolves.toBe(true);
  });
});
