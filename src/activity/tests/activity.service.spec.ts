import { ActivityService } from '../activity.service';
import { MAX_MAP_ROUTE_LOCATIONS } from '../const';
import { asyncMock, expectInternalServerError } from 'src/tests/helpers';
import { parseActivityMediaCursor } from '../activity.pagination';
import { jest } from '@jest/globals';

const activityDto = {
  duration: 100,
  distance: 1000,
  speed: 10,
  sport: 'run',
};

function createPrismaMock() {
  const prisma = {
    activity: {
      create: asyncMock(),
      createMany: asyncMock(),
      upsert: asyncMock(),
      update: asyncMock(),
      findUnique: asyncMock(),
      findMany: asyncMock(),
      delete: asyncMock(),
    },
    activityMedia: {
      count: asyncMock(),
      createMany: asyncMock(),
      findMany: asyncMock(),
      updateMany: asyncMock(),
    },
    $transaction: jest.fn(),
    friend: { findMany: asyncMock() },
    $queryRaw: asyncMock(),
  };
  prisma.$transaction.mockImplementation((async (callback: (client: unknown) => Promise<unknown>) =>
    callback({ ...prisma })) as never);
  return prisma;
}

describe('ActivityService', () => {
  it('saves activity media for an account without a subscription', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);
    prisma.activity.create.mockResolvedValue({ id: 'activity-1', mediaProcessingStatus: 'queued' });

    await expect(
      service.createActivity(
        { ...activityDto, media: [{ url: 'https://cdn.example/photo.jpg', thumbnail: null }] },
        'user-1',
      ),
    ).resolves.toEqual({ id: 'activity-1' });
    expect(account.getAccountByUserId).toHaveBeenCalledWith('user-1');
    expect(prisma.activity.create).toHaveBeenCalled();
  });

  it('rejects appending more than five media files', async () => {
    const prisma = createPrismaMock();
    const storage = { promoteActivityPhotos: asyncMock() };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never, undefined);
    prisma.activity.findUnique.mockResolvedValue({ userId: 'user-1', date: new Date('2026-09-28T12:00:00.000Z') });
    prisma.activityMedia.count.mockResolvedValue(0);

    await expect(
      service.appendActivityMedia(
        'activity-1',
        'user-1',
        Array.from({ length: 6 }, (_, index) => ({ url: `https://cdn.example/photo-${index}.jpg`, thumbnail: null })),
      ),
    ).rejects.toThrow('К активности можно добавить не больше 5 файлов');
    expect(storage.promoteActivityPhotos).not.toHaveBeenCalled();
  });
  const originalMapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalMapboxToken === undefined) delete process.env.MAPBOX_ACCESS_TOKEN;
    else process.env.MAPBOX_ACCESS_TOKEN = originalMapboxToken;
  });

  it('creates activities with and without a generated map image', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never, undefined, undefined, undefined, undefined);
    prisma.activity.create.mockResolvedValue({ id: 'activity-1', mediaProcessingStatus: 'queued' });
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);

    await expect(
      service.createActivity({ ...activityDto, description: '  Activity description  ' }, 'user-1'),
    ).resolves.toEqual({ id: 'activity-1' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        profileId: 'profile-1',
        description: 'Activity description',
        mapPhotoUrlBlurhash: null,
        mediaProcessingStatus: 'queued',
      }),
    });

    process.env.MAPBOX_ACCESS_TOKEN = 'mapbox-token';
    const locations = [
      { coords: { latitude: 55.75, longitude: 37.61 } },
      { coords: { latitude: 55.76, longitude: 37.62 } },
    ];
    await service.createActivity({ ...activityDto, locations, media: [{ url: 'photo', thumbnail: null }] }, 'user-1');
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        mapPhotoUrl: expect.stringContaining('?access_token=mapbox-token'),
      }),
    });

    await service.createActivity({ ...activityDto, locations }, 'user-1');
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        mapPhotoUrl: expect.stringContaining('?access_token=mapbox-token'),
      }),
    });
  });

  it('persists the URL returned by the server-side static map renderer', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const staticMap = {
      generateActivityMap: asyncMock().mockResolvedValue({
        url: 'https://cdn.example.com/user-1/activities/activity-1/map.webp',
        key: 'user-1/activities/activity-1/map.webp',
      }),
    };
    const locations = [
      { coords: { latitude: 55.75, longitude: 37.61 } },
      { coords: { latitude: 55.76, longitude: 37.62 } },
    ];
    const service = new ActivityService(
      prisma as never,
      account as never,
      undefined,
      undefined,
      undefined,
      staticMap as never,
    );
    prisma.activity.create.mockResolvedValue({ id: 'activity-1', mediaProcessingStatus: 'queued' });

    await service.createActivity({ ...activityDto, locations }, 'user-1');

    expect(staticMap.generateActivityMap).toHaveBeenCalledWith({
      userId: 'user-1',
      activityId: undefined,
      locations,
    });
    expect(prisma.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mapPhotoUrl: 'https://cdn.example.com/user-1/activities/activity-1/map.webp',
      }),
    });
  });

  it('keeps the activity when both map providers return no image', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const staticMap = { generateActivityMap: asyncMock().mockResolvedValue(null) };
    const service = new ActivityService(
      prisma as never,
      account as never,
      undefined,
      undefined,
      undefined,
      staticMap as never,
    );
    prisma.activity.create.mockResolvedValue({ id: 'activity-1', mediaProcessingStatus: 'queued' });
    const locations = [
      { coords: { latitude: 55.75, longitude: 37.61 } },
      { coords: { latitude: 55.76, longitude: 37.62 } },
    ];

    await service.createActivity({ ...activityDto, locations }, 'user-1');

    expect(prisma.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mapPhotoUrl: null }),
    });
  });

  it('stores estimated active calories when the profile has all required metrics', async () => {
    const prisma = createPrismaMock();
    const account = {
      getAccountByUserId: asyncMock().mockResolvedValue({
        id: 'profile-1',
        weight: '80',
        height: '180',
        age: '30',
        gender: 'male',
      }),
    };
    const service = new ActivityService(prisma as never, account as never);
    prisma.activity.create.mockResolvedValue({ id: 'activity-1', mediaProcessingStatus: 'queued' });

    await service.createActivity({ ...activityDto, distance: 10_000, duration: 3_600_000 }, 'user-1');

    expect(prisma.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ caloriesActive: 742 }),
    });
  });

  it('persists elevation gain calculated from activity locations', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);
    prisma.activity.create.mockResolvedValue({ id: 'activity-1', mediaProcessingStatus: 'queued' });
    const locations = [100, 100, 100, 120, 120, 120].map((altitude) => ({
      coords: { latitude: 55.75, longitude: 37.61, altitude },
    }));

    await service.createActivity({ ...activityDto, locations }, 'user-1');

    expect(prisma.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ elevationGain: 20 }),
    });
  });

  it('stores a route in S3 and keeps only route metadata in the activity row', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const storage = {
      uploadActivityRoute: asyncMock().mockResolvedValue({
        key: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
        formatVersion: 1,
        pointCount: 1,
        sizeBytes: 123,
        checksum: 'a'.repeat(64),
      }),
      deleteObjectByKey: asyncMock(),
    };
    const service = new ActivityService(prisma as never, account as never, undefined, storage as never);
    prisma.activity.create.mockResolvedValue({ id: 'activity-1', mediaProcessingStatus: 'queued' });
    const locations = [{ timestamp: 1, coords: { latitude: 55.75, longitude: 37.61 } }];

    await expect(service.createActivity({ ...activityDto, locations }, 'user-1')).resolves.toEqual({
      id: 'activity-1',
    });

    expect(storage.uploadActivityRoute).toHaveBeenCalledWith('user-1', expect.any(String), locations);
    expect(prisma.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        routeStorageKey: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
        routeFormatVersion: 1,
        routePointCount: 1,
        routeSizeBytes: 123,
        routeChecksum: 'a'.repeat(64),
      }),
    });
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        mapPhotoUrl: expect.stringContaining('?access_token=test-token'),
      }),
    });
  });

  it('removes an uploaded route when the activity row cannot be saved', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const storage = {
      uploadActivityRoute: asyncMock().mockResolvedValue({
        key: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
      }),
      deleteObjectByKey: asyncMock(),
    };
    const service = new ActivityService(prisma as never, account as never, undefined, storage as never);
    prisma.activity.create.mockRejectedValue(new Error('database unavailable'));

    await expectInternalServerError(
      service.createActivity(
        { ...activityDto, locations: [{ coords: { latitude: 55.75, longitude: 37.61 } }] },
        'user-1',
      ),
    );

    expect(storage.deleteObjectByKey).toHaveBeenCalledWith(
      'user-1/activities/activity-1/locations/locations-v1.json.gz',
    );
  });

  it('queues every S3 object linked to an activity before deleting its row', async () => {
    const prisma = createPrismaMock();
    const transaction = {
      activity: { findFirst: asyncMock(), delete: asyncMock() },
    };
    prisma.$transaction.mockImplementation((async (callback: (client: unknown) => Promise<unknown>) =>
      callback(transaction)) as never);
    transaction.activity.findFirst.mockResolvedValue({
      routeStorageKey: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
      media: [
        {
          url: 'https://s3.twcstorage.ru/runich-test/user-1/photo.jpg',
          thumbnail: 'https://s3.twcstorage.ru/runich-test/user-1/photo-thumb.jpg',
        },
      ],
    });
    transaction.activity.delete.mockResolvedValue({ id: 'activity-1' });
    const storage = {
      getOwnedKey: jest.fn((_userId: string, url: string) =>
        url.endsWith('thumb.jpg') ? 'user-1/photo-thumb.jpg' : 'user-1/photo.jpg',
      ),
    };
    const cleanup = { enqueueObjectCleanup: asyncMock() };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never, cleanup as never);

    await expect(service.deleteActivityById('activity-1', 'user-1')).resolves.toEqual({ id: 'activity-1' });

    expect(cleanup.enqueueObjectCleanup).toHaveBeenCalledWith(
      'user-1',
      'user-1/activities/activity-1/locations/locations-v1.json.gz',
      transaction,
    );
    expect(cleanup.enqueueObjectCleanup).toHaveBeenCalledWith('user-1', 'user-1/photo.jpg', transaction);
    expect(cleanup.enqueueObjectCleanup).toHaveBeenCalledWith('user-1', 'user-1/photo-thumb.jpg', transaction);
    expect(transaction.activity.delete).toHaveBeenCalledWith({ where: { id: 'activity-1', userId: 'user-1' } });
  });

  it('reads a stored route while keeping the locations endpoint response unchanged', async () => {
    const prisma = createPrismaMock();
    const storage = { readActivityRoute: asyncMock().mockResolvedValue([{ coords: { latitude: 55, longitude: 37 } }]) };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never, undefined);
    prisma.activity.findUnique.mockResolvedValue({
      routeStorageKey: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
      kilometresSplit: [],
      userId: 'user-1',
      visibility: 'private',
    });

    await expect(service.getLocationsByActivityId('activity-1', 'user-1')).resolves.toEqual({
      locations: [{ coords: { latitude: 55, longitude: 37 } }],
      kilometresSplit: [],
    });
    expect(storage.readActivityRoute).toHaveBeenCalledWith(
      'user-1/activities/activity-1/locations/locations-v1.json.gz',
    );
  });

  it('reads public route locations for another user', async () => {
    const prisma = createPrismaMock();
    const storage = { readActivityRoute: asyncMock().mockResolvedValue([{ coords: { latitude: 55, longitude: 37 } }]) };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never, undefined);
    prisma.activity.findUnique.mockResolvedValue({
      routeStorageKey: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
      kilometresSplit: [],
      userId: 'owner-1',
      visibility: 'public',
    });

    await expect(service.getLocationsByActivityId('activity-1', 'viewer-1')).resolves.toEqual({
      locations: [{ coords: { latitude: 55, longitude: 37 } }],
      kilometresSplit: [],
    });
    expect(storage.readActivityRoute).toHaveBeenCalledWith(
      'user-1/activities/activity-1/locations/locations-v1.json.gz',
    );
  });

  it('limits map route points without dropping timestamp or altitude', async () => {
    const prisma = createPrismaMock();
    const locations = Array.from({ length: MAX_MAP_ROUTE_LOCATIONS + 1 }, (_, index) => ({
      timestamp: index,
      coords: {
        latitude: 55 + index / 100_000,
        longitude: 37 + index / 100_000,
        altitude: index,
        speed: index / 10,
      },
    }));
    const storage = { readActivityRoute: asyncMock().mockResolvedValue(locations) };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never);
    prisma.activity.findUnique.mockResolvedValue({
      routeStorageKey: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
      kilometresSplit: [],
      userId: 'user-1',
      visibility: 'private',
    });

    const response = await service.getLocationsByActivityId('activity-1', 'user-1');

    expect(response?.locations).toHaveLength(MAX_MAP_ROUTE_LOCATIONS);
    expect(response?.locations?.[0]).toEqual(locations[0]);
    expect(response?.locations?.at(-1)).toEqual(locations.at(-1));
    expect(response?.locations?.[Math.floor(MAX_MAP_ROUTE_LOCATIONS / 2)]).toEqual(
      expect.objectContaining({
        timestamp: expect.any(Number),
        coords: expect.objectContaining({ altitude: expect.any(Number) }),
      }),
    );
  });

  it('generates a title from the activity time and sport when title is missing', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);

    await service.createActivity({ ...activityDto, date: '2026-08-12T07:15:00', title: '   ' }, 'user-1');
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ title: 'Утренний бег' }),
    });

    await service.createActivity(
      {
        ...activityDto,
        sport: 'ride',
        date: '2026-08-12T20:15:00.000Z',
        timeZone: 'Europe/Moscow',
        title: undefined,
      },
      'user-1',
    );
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ title: 'Вечерний велозаезд', timeZone: 'Europe/Moscow' }),
    });

    await service.createActivity({ ...activityDto, title: 'Моя пробежка' }, 'user-1');
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ title: 'Моя пробежка' }),
    });
  });

  it('persists optional pedometer data for the activity and its kilometre splits', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);
    const pedometerActivity = {
      ...activityDto,
      sport: 'walk',
      steps: 1240,
      kilometresSplit: [
        {
          lastKilometerDuration: 600_000,
          lastKilometerAltitude: 0,
          lastKilometerSteps: 1240,
          kilometerPoint: { coords: { latitude: 55.75, longitude: 37.61 } },
        },
      ],
    };

    await service.createActivity(pedometerActivity, 'user-1');
    expect(prisma.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        steps: 1240,
        kilometresSplit: pedometerActivity.kilometresSplit,
      }),
    });

    await service.updateActivity(pedometerActivity, 'activity-1');
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1', userId: 'activity-1' },
      data: {
        title: undefined,
        sport: 'walk',
        visibility: undefined,
        emotion: undefined,
        date: undefined,
        description: null,
        distance: 1000,
        duration: 100,
        speed: 10,
        caloriesActive: null,
      },
    });
  });

  it('upserts migration activities and skips duplicate source identities', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findMany.mockResolvedValue([]);
    const activities = Array.from({ length: 101 }, (_, index) => ({
      ...activityDto,
      title: 'Импортированная активность',
      userId: 'user-1',
      profileId: 'profile-1',
      source: 'strava' as const,
      sourceActivityId: `strava-${index}`,
    }));
    const duplicateActivity = { ...activities[0]!, title: 'Duplicate archive record' };

    await expect(service.createActivitiesFromMigrationArchive([...activities, duplicateActivity])).resolves.toEqual({
      success: true,
      importedActivities: 101,
    });
    expect(prisma.activity.upsert).toHaveBeenCalledTimes(101);
    expect(prisma.activity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_source_sourceActivityId: {
            userId: 'user-1',
            source: 'strava',
            sourceActivityId: 'strava-0',
          },
        },
        create: expect.objectContaining({ title: 'Импортированная активность', elevationGain: 0 }),
      }),
    );
    await expect(service.createActivitiesFromMigrationArchive([])).resolves.toEqual({
      success: true,
      importedActivities: 0,
    });
  });

  it('uses Strava elevation gain from the migration CSV for imported routes', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findMany.mockResolvedValue([]);

    await service.createActivitiesFromMigrationArchive([
      {
        ...activityDto,
        userId: 'user-1',
        profileId: 'profile-1',
        source: 'strava',
        sourceActivityId: '4690482415',
        sourceElevationGain: 42.2,
        locations: [
          { coords: { latitude: 55.627, longitude: 37.307, altitude: 204 } },
          { coords: { latitude: 55.628, longitude: 37.306, altitude: 313 } },
        ],
      },
    ]);

    const upsertCalls = prisma.activity.upsert.mock.calls as unknown as Array<[{ create: Record<string, unknown> }]>;
    expect(upsertCalls[0]?.[0]?.create).toEqual(expect.objectContaining({ elevationGain: 42.2 }));
    expect(upsertCalls[0]?.[0]?.create).not.toHaveProperty('sourceElevationGain');
  });

  it('uploads imported activity routes and stores only their metadata', async () => {
    const prisma = createPrismaMock();
    const storage = {
      uploadActivityRoute: asyncMock().mockResolvedValue({
        key: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
        formatVersion: 1,
        pointCount: 2,
        sizeBytes: 123,
        checksum: 'a'.repeat(64),
      }),
      deleteObjectByKey: asyncMock(),
    };
    const staticMap = {
      generateActivityMap: asyncMock().mockResolvedValue({
        key: 'user-1/activities/activity-1/map.webp',
        url: 'https://cdn.example.com/user-1/activities/activity-1/map.webp',
      }),
    };
    const service = new ActivityService(
      prisma as never,
      {} as never,
      undefined,
      storage as never,
      undefined,
      staticMap as never,
    );
    const locations = [
      { coords: { latitude: 55.75, longitude: 37.61 } },
      { coords: { latitude: 55.76, longitude: 37.62 } },
    ];
    const activity = {
      ...activityDto,
      id: 'activity-1',
      description: 'Imported activity description',
      userId: 'user-1',
      profileId: 'profile-1',
      source: 'strava' as const,
      sourceActivityId: 'strava-1',
      locations,
    };
    prisma.activity.findMany.mockResolvedValue([]);

    await expect(service.createActivitiesFromMigrationArchive([activity])).resolves.toEqual({
      success: true,
      importedActivities: 1,
    });

    expect(storage.uploadActivityRoute).toHaveBeenCalledWith('user-1', 'activity-1', locations);
    expect(staticMap.generateActivityMap).toHaveBeenCalledWith({
      userId: 'user-1',
      activityId: 'activity-1',
      locations,
    });
    expect(prisma.activity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_source_sourceActivityId: {
            userId: 'user-1',
            source: 'strava',
            sourceActivityId: 'strava-1',
          },
        },
        create: expect.objectContaining({
          id: 'activity-1',
          description: 'Imported activity description',
          routeStorageKey: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
          routeFormatVersion: 1,
          routePointCount: 2,
          routeSizeBytes: 123,
          routeChecksum: 'a'.repeat(64),
          mapPhotoUrl: 'https://cdn.example.com/user-1/activities/activity-1/map.webp',
        }),
      }),
    );
    const upsertCalls = prisma.activity.upsert.mock.calls as unknown as Array<[{ create: Record<string, unknown> }]>;
    expect(upsertCalls[0]?.[0]?.create).not.toHaveProperty('locations');
  });

  it('updates, reads, paginates and deletes activities', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, { getAccountByUserId: asyncMock() } as never);
    const activity = { id: 'activity-1' };
    prisma.activity.update.mockResolvedValue(activity);
    prisma.activity.findUnique.mockResolvedValue(activity);
    prisma.activity.findMany.mockResolvedValue([{ id: 'activity-1', media: [{ url: 'photo', thumbnail: null }] }]);
    prisma.$queryRaw.mockResolvedValue([{ id: 'activity-1', media: [{ url: 'photo', thumbnail: null }] }]);
    prisma.activityMedia.findMany.mockResolvedValue([
      {
        activityDate: new Date('2026-08-12T23:15:00.000Z'),
        id: 'media-1',
        activityId: 'activity-1',
        position: 0,
        url: 'photo',
        thumbnail: null,
        blurhash: null,
      },
    ]);
    prisma.activity.delete.mockResolvedValue(activity);

    await expect(service.updateActivity({ ...activityDto, title: 'Morning run' }, 'activity-1')).resolves.toEqual(
      activity,
    );
    await expect(service.getLocationsByActivityId('activity-1')).resolves.toBeNull();
    await expect(service.getActivityByActivityId('activity-1')).resolves.toBeNull();
    await expect(service.getMediaByUserId('user-1', '1')).resolves.toEqual({
      media: [{ id: 'media-1', activityId: 'activity-1', url: 'photo', thumbnail: null, blurhash: null }],
      hasMore: false,
      nextCursor: null,
      isLastPage: true,
    });
    await expect(service.getActivitesByUserId('user-1', '5')).resolves.toEqual({
      activities: [{ id: 'activity-1', media: [{ url: 'photo', thumbnail: null }] }],
      hasMore: false,
      nextCursor: null,
      isLastPage: true,
    });
    await expect(service.getActivitiesByTheirIds(['activity-1', 'activity-2'])).resolves.toEqual([
      { id: 'activity-1', media: [{ url: 'photo', thumbnail: null }] },
    ]);
    expect(prisma.activity.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['activity-1', 'activity-2'] } }) }),
    );
    await service.getActivitiesByTheirIds(' activity-1, activity-2 ');
    expect(prisma.activity.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['activity-1', 'activity-2'] } }) }),
    );
    await expect(service.getActivitiesByTheirIds(' , ')).resolves.toEqual([]);
    await expect(service.getAllActivitiesWithFriends('user-1', '5')).resolves.toEqual({
      activities: [{ id: 'activity-1', media: [{ url: 'photo', thumbnail: null }] }],
      hasMore: false,
      nextCursor: null,
      isLastPage: true,
    });
    expect(prisma.friend.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [template] = prisma.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray];
    expect(Array.from(template).join('')).toContain('EXISTS');
    await expect(service.deleteActivityById('activity-1')).resolves.toEqual(activity);
  });

  it('uses twenty activities as the default page size', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, { getAccountByUserId: asyncMock() } as never);
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);

    await service.getActivitesByUserId('user-1');
    expect(prisma.activity.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));

    await service.getAllActivitiesWithFriends('user-1');
    expect(prisma.$queryRaw).toHaveBeenLastCalledWith(
      expect.anything(),
      'user-1',
      'user-1',
      true,
      null,
      null,
      null,
      21,
    );
  });

  it('uses a stable cursor for activities and media pages', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    const newestDate = new Date('2026-08-12T23:15:00.000Z');
    const olderDate = new Date('2026-08-12T22:15:00.000Z');

    prisma.activity.findMany.mockResolvedValueOnce([
      { id: 'activity-2', date: newestDate },
      { id: 'activity-1', date: olderDate },
    ]);
    const activitiesPage = await service.getActivitesByUserId('user-1', '1');
    expect(activitiesPage).toMatchObject({ activities: [{ id: 'activity-2' }], hasMore: true });
    expect(activitiesPage?.nextCursor).toEqual(expect.any(String));
    expect(prisma.activity.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 2 }),
    );

    prisma.activityMedia.findMany.mockResolvedValueOnce([
      {
        activityDate: newestDate,
        activityId: 'activity-2',
        position: 0,
        url: 'photo-1',
        thumbnail: null,
        blurhash: null,
      },
      {
        activityDate: newestDate,
        activityId: 'activity-2',
        position: 1,
        url: 'photo-2',
        thumbnail: null,
        blurhash: null,
      },
    ]);
    const mediaPage = await service.getMediaByUserId('user-1', '1');
    expect(mediaPage).toMatchObject({ media: [{ url: 'photo-1' }], hasMore: true });
    const mediaCursor = parseActivityMediaCursor(mediaPage?.nextCursor ?? undefined);
    expect(mediaCursor).toEqual({ date: newestDate, id: 'activity-2', photoIndex: 0 });

    prisma.activityMedia.findMany.mockResolvedValueOnce([
      {
        activityDate: newestDate,
        activityId: 'activity-2',
        position: 1,
        url: 'photo-2',
        thumbnail: null,
        blurhash: null,
      },
      {
        activityDate: olderDate,
        activityId: 'activity-1',
        position: 0,
        url: 'photo-3',
        thumbnail: null,
        blurhash: null,
      },
    ]);
    await expect(service.getMediaByUserId('user-1', '1', mediaCursor)).resolves.toMatchObject({
      media: [{ url: 'photo-2' }],
      hasMore: true,
    });
  });

  it('uses a compact select for activity list responses', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.friend.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);

    await service.getActivitesByUserId('user-1');
    await service.getActivitiesByTheirIds('activity-1');
    await service.getAllActivitiesWithFriends('user-1');

    for (const options of prisma.activity.findMany.mock.calls as unknown[][]) {
      const query = (options[0] ?? {}) as { select?: Record<string, unknown>; include?: unknown; skip?: number };
      if (query.skip === undefined && !query.select?.profile) continue;
      expect(query.include).toBeUndefined();
      expect(query.select).toEqual(
        expect.objectContaining({
          id: true,
          userId: true,
          title: true,
          media: expect.any(Object),
          mapPhotoUrl: true,
          duration: true,
          distance: true,
          profile: expect.any(Object),
          _count: expect.any(Object),
        }),
      );
      expect(query.select).not.toHaveProperty('locations');
      expect(query.select).toHaveProperty('kilometresSplit', true);
      expect(query.select).toHaveProperty('emotion', true);
      expect(query.select).not.toHaveProperty('description');
    }

    const [feedTemplate] = prisma.$queryRaw.mock.calls.at(-1) as unknown as [TemplateStringsArray];
    expect(Array.from(feedTemplate).join('')).toContain('a."emotion"');

    await service.getActivityByActivityId('activity-1');
    const detailQuery = ((prisma.activity.findUnique.mock.calls as unknown[][])[0]?.[0] ?? {}) as {
      select?: Record<string, unknown>;
    };
    expect(detailQuery.select).toEqual(expect.objectContaining({ description: true, kilometresSplit: true }));
  });

  it('returns email data even when the activity does not exist', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue(null);

    await expect(service.getActivityWithEmailData('missing')).resolves.toEqual({
      profile: undefined,
      email: undefined,
      mapPhotoUrl: undefined,
    });
  });

  it('converts database failures from every caught method to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);
    prisma.activity.create.mockRejectedValue(error);
    await expectInternalServerError(service.createActivity({ ...activityDto }, 'u1'));
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.activity.upsert.mockRejectedValue(error);
    await expectInternalServerError(
      service.createActivitiesFromMigrationArchive([
        { ...activityDto, userId: 'u1', profileId: 'p1', source: 'strava', sourceActivityId: 's1' },
      ]),
    );
    prisma.activity.update.mockRejectedValue(error);
    await expectInternalServerError(service.updateActivity(activityDto, 'a1'));
    prisma.activity.findUnique.mockRejectedValue(error);
    await expectInternalServerError(service.getActivityByActivityId('a1'));
    await expectInternalServerError(service.getActivityWithEmailData('a1'));
    prisma.activity.findMany.mockRejectedValue(error);
    await expectInternalServerError(service.getMediaByUserId('u1', '10'));
    await expectInternalServerError(service.getActivitesByUserId('u1'));
    await expectInternalServerError(service.getActivitiesByTheirIds('a1'));
    prisma.$queryRaw.mockRejectedValue(error);
    await expectInternalServerError(service.getAllActivitiesWithFriends('u1'));
    prisma.activity.delete.mockRejectedValue(error);
    await expectInternalServerError(service.deleteActivityById('a1'));
  });

  it('propagates the raw database error from the locations query', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    const error = new Error('database unavailable');
    prisma.activity.findUnique.mockRejectedValue(error);

    await expect(service.getLocationsByActivityId('a1')).rejects.toBe(error);
  });
});
