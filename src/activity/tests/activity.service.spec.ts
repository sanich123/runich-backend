import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { ActivityService } from '../services/activity.service';
import { MAX_MAP_ROUTE_LOCATIONS } from '../const';
import { asyncMock, expectInternalServerError } from 'src/tests/helpers';
import { encodeActivityCursor, parseActivityCursor, parseActivityMediaCursor } from '../activity.pagination';
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
      findFirst: asyncMock(),
      findMany: asyncMock(),
      delete: asyncMock(),
    },
    activityMedia: {
      count: asyncMock(),
      create: asyncMock(),
      createMany: asyncMock(),
      findFirst: asyncMock(),
      findMany: asyncMock(),
      updateMany: asyncMock(),
    },
    $transaction: jest.fn(),
    friend: { findMany: asyncMock() },
    userBlock: { findFirst: asyncMock(), findMany: asyncMock() },
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

  it('rejects appending media when the activity does not exist', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue(null);

    await expect(
      service.appendActivityMedia('missing-activity', 'user-1', [{ url: 'photo', thumbnail: null }]),
    ).rejects.toThrow('Активность не найдена');
    expect(prisma.activityMedia.count).not.toHaveBeenCalled();
  });

  it('rejects appending media when the current user is not the activity owner', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue({ userId: 'owner-1', date: new Date() });

    await expect(
      service.appendActivityMedia('activity-1', 'user-1', [{ url: 'photo', thumbnail: null }]),
    ).rejects.toThrow('Недостаточно прав');
    expect(prisma.activityMedia.count).not.toHaveBeenCalled();
  });

  it('rejects appending media when storage is not configured', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue({ userId: 'user-1', date: new Date() });

    await expect(
      service.appendActivityMedia('activity-1', 'user-1', [{ url: 'photo', thumbnail: null }]),
    ).rejects.toThrow('Сервис хранения медиа не настроен');
    expect(prisma.activityMedia.count).not.toHaveBeenCalled();
  });

  it('returns persisted media records when appending files to an activity', async () => {
    const prisma = createPrismaMock();
    const storage = {
      promoteActivityPhotos: asyncMock().mockResolvedValue({
        keys: ['user-1/activities/activity-1/photo.jpg'],
        photos: [{ url: 'https://cdn.example/photo.jpg', thumbnail: 'https://cdn.example/photo-thumb.jpg' }],
      }),
      refreshLinkedActivityMedia: asyncMock(),
    };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never, undefined);
    const activityDate = new Date('2026-09-28T12:00:00.000Z');
    prisma.activity.findUnique.mockResolvedValue({ userId: 'user-1', date: activityDate });
    prisma.activityMedia.count.mockResolvedValue(2);
    prisma.activityMedia.findFirst.mockResolvedValue({ position: 1 });
    const persistedMedia = [
      {
        id: 'media-1',
        activityId: 'activity-1',
        userId: 'user-1',
        activityDate,
        position: 2,
        url: 'https://cdn.example/photo.jpg',
        thumbnail: 'https://cdn.example/photo-thumb.jpg',
        blurhash: null,
      },
    ];
    prisma.activityMedia.create.mockResolvedValue(persistedMedia[0]);
    prisma.activityMedia.findMany.mockResolvedValue(persistedMedia);

    await expect(
      service.appendActivityMedia('activity-1', 'user-1', [
        { url: 'https://temporary.example/photo.jpg', thumbnail: 'https://temporary.example/photo-thumb.jpg' },
      ]),
    ).resolves.toEqual({ success: true, media: persistedMedia });
    expect(prisma.activityMedia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityId: 'activity-1',
        position: 2,
        url: 'https://cdn.example/photo.jpg',
        thumbnail: 'https://cdn.example/photo-thumb.jpg',
      }),
    });
  });

  it('removes promoted files when a concurrent append crosses the five-file limit', async () => {
    const prisma = createPrismaMock();
    const storage = {
      promoteActivityPhotos: asyncMock().mockResolvedValue({
        keys: ['user-1/activities/activity-1/photo.jpg'],
        photos: [{ url: 'https://cdn.example/photo.jpg', thumbnail: null }],
      }),
      deleteObjectByKey: asyncMock(),
    };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never, undefined);
    prisma.activity.findUnique.mockResolvedValue({ userId: 'user-1', date: new Date() });
    prisma.activityMedia.count.mockResolvedValueOnce(4).mockResolvedValueOnce(5);

    await expect(
      service.appendActivityMedia('activity-1', 'user-1', [{ url: 'https://temporary/photo.jpg', thumbnail: null }]),
    ).rejects.toThrow('К активности можно добавить не больше 5 файлов');
    expect(storage.deleteObjectByKey).toHaveBeenCalledWith('user-1/activities/activity-1/photo.jpg');
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
      hideMap: false,
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

  it('prefers Health Connect calories and estimates them only when the source omitted them', async () => {
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
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.activity.create.mockResolvedValue({ id: 'activity-1', mediaProcessingStatus: 'queued' });

    await service.importWatchWorkouts(
      [
        {
          ...activityDto,
          duration: 3_600_000,
          distance: 10_000,
          source: 'health-connect',
          sourceActivityId: 'with-source-calories',
          caloriesActive: 425,
          locations: [],
        },
        {
          ...activityDto,
          duration: 3_600_000,
          distance: 10_000,
          source: 'health-connect',
          sourceActivityId: 'without-source-calories',
          locations: [],
        },
      ],
      'user-1',
    );

    const createdCalories = (
      prisma.activity.create.mock.calls as unknown as Array<[{ data: { caloriesActive: number | null } }]>
    ).map(([{ data }]) => data.caloriesActive);
    expect(createdCalories).toEqual([425, 742]);
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
      refreshLinkedActivityMedia: asyncMock(),
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
          mediaModerationAssetId: 'asset-1',
          thumbnailModerationAssetId: 'thumbnail-1',
        },
      ],
    });
    transaction.activity.delete.mockResolvedValue({ id: 'activity-1' });
    const storage = {
      getOwnedKey: jest.fn((_userId: string, url: string) =>
        url.endsWith('thumb.jpg') ? 'user-1/photo-thumb.jpg' : 'user-1/photo.jpg',
      ),
      deleteActivityModerationAssets: asyncMock(),
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
    expect(storage.deleteActivityModerationAssets).toHaveBeenCalledWith('user-1', ['asset-1', 'thumbnail-1']);
  });

  it('deletes unattached moderation assets when deleting an activity without cleanup worker', async () => {
    const prisma = createPrismaMock();
    const storage = { deleteActivityModerationAssets: asyncMock() };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never);
    prisma.activity.findFirst.mockResolvedValue({
      media: [{ mediaModerationAssetId: 'asset-1', thumbnailModerationAssetId: null }],
    });
    prisma.activity.delete.mockResolvedValue({ id: 'activity-1' });

    await expect(service.deleteActivityById('activity-1', 'user-1')).resolves.toEqual({ id: 'activity-1' });
    expect(storage.deleteActivityModerationAssets).toHaveBeenCalledWith('user-1', ['asset-1', null]);
    expect(prisma.activity.delete).toHaveBeenCalledWith({ where: { id: 'activity-1', userId: 'user-1' } });
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

  it('imports watch workouts once per source identity', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);
    prisma.activity.findMany.mockResolvedValue([{ source: 'health-connect', sourceActivityId: 'existing' }]);
    prisma.activity.create.mockResolvedValue({ id: 'activity-new', mediaProcessingStatus: 'queued' });

    const existingWorkout = {
      ...activityDto,
      source: 'health-connect' as const,
      sourceActivityId: 'existing',
      locations: [],
    };
    const newWorkout = {
      ...activityDto,
      source: 'health-connect' as const,
      sourceActivityId: 'new',
      locations: [],
    };

    await expect(service.importWatchWorkouts([existingWorkout, newWorkout, newWorkout], 'user-1')).resolves.toEqual({
      imported: 1,
      skipped: 2,
      activities: [{ id: 'activity-new' }],
    });
    expect(prisma.activity.create).toHaveBeenCalledTimes(1);
  });

  it('refreshes an existing watch workout and replaces its route without changing its activity id', async () => {
    const prisma = createPrismaMock();
    const routeStorageKey = 'user-1/activities/new-route-id/locations/locations-v1.json.gz';
    const mapStorageKey = 'user-1/activities/new-route-id/map.webp';
    const previousRouteKey = 'user-1/activities/old-route-id/locations/locations-v1.json.gz';
    const previousMapKey = 'user-1/activities/old-route-id/map.webp';
    const storage = {
      uploadActivityRoute: asyncMock().mockResolvedValue({
        key: routeStorageKey,
        formatVersion: 1,
        pointCount: 2,
        sizeBytes: 123,
        checksum: 'b'.repeat(64),
      }),
      getOwnedKey: jest.fn().mockReturnValue(previousMapKey),
    };
    const cleanup = { enqueueObjectCleanup: asyncMock() };
    const staticMap = {
      generateActivityMap: asyncMock().mockResolvedValue({
        key: mapStorageKey,
        url: 'https://cdn.example.com/user-1/activities/new-route-id/map.webp',
      }),
    };
    const service = new ActivityService(
      prisma as never,
      { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) } as never,
      undefined,
      storage as never,
      cleanup as never,
      staticMap as never,
    );
    const previousActivity = {
      id: 'activity-existing',
      source: 'health-connect',
      sourceActivityId: 'record-1',
      profileId: 'profile-1',
      routeStorageKey: previousRouteKey,
      mapPhotoUrl: 'https://cdn.example.com/user-1/activities/old-route-id/map.webp',
    };
    prisma.activity.findMany.mockResolvedValue([previousActivity]);
    prisma.activity.update.mockResolvedValue({ id: 'activity-existing', mediaProcessingStatus: 'queued' });
    const locations = [
      { timestamp: 1, coords: { latitude: 55.75, longitude: 37.61 } },
      { timestamp: 2, coords: { latitude: 55.76, longitude: 37.62 } },
    ];

    await expect(
      service.importWatchWorkouts(
        [
          {
            ...activityDto,
            date: '2026-10-15T12:00:00.000Z',
            timeZone: 'Europe/Moscow',
            duration: 120,
            distance: 1_200,
            speed: 10,
            steps: 900,
            title: 'Updated workout title',
            source: 'health-connect',
            sourceActivityId: 'record-1',
            locations,
          },
        ],
        'user-1',
      ),
    ).resolves.toEqual({
      imported: 1,
      skipped: 0,
      activities: [{ id: 'activity-existing' }],
    });

    expect(storage.uploadActivityRoute).toHaveBeenCalledWith(
      'user-1',
      expect.not.stringMatching('activity-existing'),
      locations,
    );
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-existing' },
      data: expect.objectContaining({
        date: '2026-10-15T12:00:00.000Z',
        duration: 120,
        distance: 1_200,
        steps: 900,
        title: 'Updated workout title',
        routeStorageKey,
        routePointCount: 2,
        routeChecksum: 'b'.repeat(64),
        mapPhotoUrl: 'https://cdn.example.com/user-1/activities/new-route-id/map.webp',
      }),
    });
    const updateCalls = prisma.activity.update.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>;
    const updateData = updateCalls[0]?.[0].data;
    expect(updateData).not.toHaveProperty('visibility');
    expect(updateData).not.toHaveProperty('description');
    expect(updateData).not.toHaveProperty('locations');
    expect(cleanup.enqueueObjectCleanup).toHaveBeenCalledWith('user-1', previousRouteKey);
    expect(cleanup.enqueueObjectCleanup).toHaveBeenCalledWith('user-1', previousMapKey);
  });

  it('refreshes watch workout metrics while preserving its stored route when Health Connect returns no points', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);
    prisma.activity.findMany.mockResolvedValue([
      {
        id: 'activity-existing',
        source: 'health-connect',
        sourceActivityId: 'record-1',
        profileId: 'profile-1',
        routeStorageKey: 'user-1/activities/old-route/locations/locations-v1.json.gz',
        mapPhotoUrl: 'https://cdn.example.com/user-1/activities/old-route/map.webp',
      },
    ]);
    prisma.activity.update.mockResolvedValue({ id: 'activity-existing' });

    await expect(
      service.importWatchWorkouts(
        [
          {
            ...activityDto,
            date: '2026-10-15T12:00:00.000Z',
            duration: 130,
            distance: 1_300,
            speed: 10,
            source: 'health-connect',
            sourceActivityId: 'record-1',
            locations: [],
          },
        ],
        'user-1',
      ),
    ).resolves.toMatchObject({ imported: 1, skipped: 0 });

    const updateCalls = prisma.activity.update.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>;
    const updateData = updateCalls[0]?.[0].data;
    expect(updateData).toEqual(
      expect.objectContaining({ date: '2026-10-15T12:00:00.000Z', duration: 130, distance: 1_300, speed: 10 }),
    );
    expect(updateData).not.toHaveProperty('routeStorageKey');
    expect(updateData).not.toHaveProperty('routePointCount');
    expect(updateData).not.toHaveProperty('mapPhotoUrl');
  });

  it('deletes the newly uploaded route when refreshing an existing workout fails', async () => {
    const prisma = createPrismaMock();
    const routeKey = 'user-1/activities/new-route/locations/locations-v1.json.gz';
    const storage = {
      uploadActivityRoute: asyncMock().mockResolvedValue({ key: routeKey, formatVersion: 1, pointCount: 1 }),
      deleteObjectByKey: asyncMock(),
    };
    const staticMap = {
      generateActivityMap: asyncMock().mockResolvedValue({
        key: 'user-1/activities/new-route/map.webp',
        url: 'https://cdn.example.com/user-1/activities/new-route/map.webp',
      }),
    };
    const service = new ActivityService(
      prisma as never,
      { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) } as never,
      undefined,
      storage as never,
      undefined,
      staticMap as never,
    );
    prisma.activity.findMany.mockResolvedValue([
      {
        id: 'activity-existing',
        source: 'health-connect',
        sourceActivityId: 'record-1',
        profileId: 'profile-1',
        routeStorageKey: null,
        mapPhotoUrl: null,
      },
    ]);
    prisma.activity.update.mockRejectedValue(new Error('database unavailable'));

    await expectInternalServerError(
      service.importWatchWorkouts(
        [
          {
            ...activityDto,
            date: '2026-10-15T12:00:00.000Z',
            source: 'health-connect',
            sourceActivityId: 'record-1',
            locations: [{ coords: { latitude: 55.75, longitude: 37.61 } }],
          },
        ],
        'user-1',
      ),
    );

    expect(storage.deleteObjectByKey).toHaveBeenCalledWith(routeKey);
  });

  it('keeps a watch workout update successful when old route cleanup cannot be queued', async () => {
    const prisma = createPrismaMock();
    const routeKey = 'user-1/activities/new-route/locations/locations-v1.json.gz';
    const oldRouteKey = 'user-1/activities/old-route/locations/locations-v1.json.gz';
    const storage = {
      uploadActivityRoute: asyncMock().mockResolvedValue({ key: routeKey, formatVersion: 1, pointCount: 1 }),
    };
    const cleanup = { enqueueObjectCleanup: asyncMock().mockRejectedValue(new Error('queue unavailable')) };
    const staticMap = {
      generateActivityMap: asyncMock().mockResolvedValue({
        key: 'user-1/activities/new-route/map.webp',
        url: 'https://cdn.example.com/user-1/activities/new-route/map.webp',
      }),
    };
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new ActivityService(
      prisma as never,
      { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) } as never,
      undefined,
      storage as never,
      cleanup as never,
      staticMap as never,
    );
    prisma.activity.findMany.mockResolvedValue([
      {
        id: 'activity-existing',
        source: 'health-connect',
        sourceActivityId: 'record-1',
        profileId: 'profile-1',
        routeStorageKey: oldRouteKey,
        mapPhotoUrl: null,
      },
    ]);
    prisma.activity.update.mockResolvedValue({ id: 'activity-existing' });

    await expect(
      service.importWatchWorkouts(
        [
          {
            ...activityDto,
            date: '2026-10-15T12:00:00.000Z',
            source: 'health-connect',
            sourceActivityId: 'record-1',
            locations: [{ coords: { latitude: 55.75, longitude: 37.61 } }],
          },
        ],
        'user-1',
      ),
    ).resolves.toMatchObject({ imported: 1, skipped: 0 });

    expect(cleanup.enqueueObjectCleanup).toHaveBeenCalledWith('user-1', oldRouteKey);
    expect(logError).toHaveBeenCalledWith(
      'Не удалось поставить старые файлы активности в очередь удаления',
      expect.any(Error),
    );
  });

  it('uses Strava elevation gain from the migration CSV for imported routes', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
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

  it('uses Strava CSV calories before profile estimates and leaves unavailable estimates empty', async () => {
    const prisma = createPrismaMock();
    const account = {
      getAccountByUserId: jest.fn(async (userId: string) =>
        userId === 'user-complete'
          ? { id: 'profile-complete', weight: '80', height: '180', age: '30', gender: 'male' }
          : { id: 'profile-incomplete' },
      ),
    };
    const service = new ActivityService(prisma as never, account as never);
    prisma.activity.findMany.mockResolvedValue([]);
    const sharedActivity = {
      ...activityDto,
      duration: 3_600_000,
      distance: 10_000,
      profileId: 'profile-1',
      source: 'strava' as const,
      locations: [],
    };

    await service.createActivitiesFromMigrationArchive([
      { ...sharedActivity, userId: 'user-complete', sourceActivityId: 'csv-calories', caloriesActive: 611 },
      { ...sharedActivity, userId: 'user-complete', sourceActivityId: 'estimated-calories' },
      { ...sharedActivity, userId: 'user-incomplete', sourceActivityId: 'no-calories' },
    ]);

    const createBySourceId = new Map(
      (
        prisma.activity.upsert.mock.calls as unknown as Array<
          [{ create: { sourceActivityId: string; caloriesActive: number | null } }]
        >
      ).map(([{ create }]) => [create.sourceActivityId, create.caloriesActive]),
    );
    expect(createBySourceId).toEqual(
      new Map([
        ['csv-calories', 611],
        ['estimated-calories', 742],
        ['no-calories', null],
      ]),
    );
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
      hideMap: false,
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

  it('preserves imported calorie values when editing an activity', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);
    prisma.activity.findFirst.mockResolvedValue({ source: 'strava', caloriesActive: 613 });
    prisma.activity.update.mockResolvedValue({ id: 'activity-1' });

    await service.updateActivity({ ...activityDto, distance: 9_000, duration: 3_600_000 }, 'activity-1');

    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1', userId: 'activity-1' },
      data: expect.objectContaining({ caloriesActive: 613 }),
    });
  });

  it('switches a hidden activity back to its already generated full map', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const staticMap = { generateActivityMap: asyncMock() };
    const service = new ActivityService(
      prisma as never,
      account as never,
      undefined,
      undefined,
      undefined,
      staticMap as never,
    );
    prisma.activity.findFirst.mockResolvedValue({
      hideMap: true,
      routeStorageKey: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
      mapPhotoUrl: 'https://cdn.example.com/map.webp',
      routeOnlyMapPhotoUrl: 'https://cdn.example.com/map-route-only.webp',
    });
    prisma.activity.update.mockResolvedValue({ id: 'activity-1', hideMap: false });

    await expect(service.updateActivity({ ...activityDto, hideMap: false }, 'activity-1', 'user-1')).resolves.toEqual({
      id: 'activity-1',
      hideMap: false,
    });

    expect(staticMap.generateActivityMap).not.toHaveBeenCalled();
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1', userId: 'user-1' },
      data: expect.objectContaining({ hideMap: false }),
    });
  });

  it('generates a route-only image when an activity is hidden', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const locations = [
      { coords: { latitude: 55.75, longitude: 37.61 } },
      { coords: { latitude: 55.76, longitude: 37.62 } },
    ];
    const storage = {
      readActivityRoute: asyncMock().mockResolvedValue(locations),
    };
    const staticMap = {
      generateActivityMap: asyncMock().mockResolvedValue({
        key: 'user-1/activities/activity-1/map-route-only.webp',
        url: 'https://cdn.example.com/map-route-only.webp',
      }),
    };
    const service = new ActivityService(
      prisma as never,
      account as never,
      undefined,
      storage as never,
      undefined,
      staticMap as never,
    );
    prisma.activity.findFirst.mockResolvedValue({
      hideMap: false,
      routeStorageKey: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
      mapPhotoUrl: 'https://cdn.example.com/map.webp',
      routeOnlyMapPhotoUrl: null,
    });
    prisma.activity.update.mockResolvedValue({ id: 'activity-1', hideMap: true });

    await service.updateActivity({ ...activityDto, hideMap: true }, 'activity-1', 'user-1');

    expect(storage.readActivityRoute).toHaveBeenCalledWith(
      'user-1/activities/activity-1/locations/locations-v1.json.gz',
    );
    expect(staticMap.generateActivityMap).toHaveBeenCalledWith({
      userId: 'user-1',
      activityId: expect.any(String),
      locations,
      hideMap: true,
    });
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1', userId: 'user-1' },
      data: expect.objectContaining({
        hideMap: true,
        routeOnlyMapPhotoUrl: 'https://cdn.example.com/map-route-only.webp',
      }),
    });
  });

  it('repairs legacy hidden activities by generating both map images', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const locations = [
      { coords: { latitude: 55.75, longitude: 37.61 } },
      { coords: { latitude: 55.76, longitude: 37.62 } },
    ];
    const storage = {
      readActivityRoute: asyncMock().mockResolvedValue(locations),
      getOwnedKey: jest.fn().mockReturnValue('user-1/activities/activity-1/map.webp'),
    };
    const cleanup = { enqueueObjectCleanup: asyncMock() };
    const staticMap = {
      generateActivityMap: asyncMock()
        .mockResolvedValueOnce({ key: 'new-map.webp', url: 'https://cdn.example.com/new-map.webp' })
        .mockResolvedValueOnce({
          key: 'new-route-only.webp',
          url: 'https://cdn.example.com/new-route-only.webp',
        }),
    };
    const service = new ActivityService(
      prisma as never,
      account as never,
      undefined,
      storage as never,
      cleanup as never,
      staticMap as never,
    );
    prisma.activity.findFirst.mockResolvedValue({
      hideMap: true,
      routeStorageKey: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
      mapPhotoUrl: 'https://cdn.example.com/legacy-route-only.webp',
      routeOnlyMapPhotoUrl: null,
    });
    prisma.activity.update.mockResolvedValue({ id: 'activity-1', hideMap: true });

    await service.updateActivity({ ...activityDto, hideMap: true }, 'activity-1', 'user-1');

    expect(staticMap.generateActivityMap).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      activityId: expect.any(String),
      locations,
      hideMap: false,
    });
    expect(staticMap.generateActivityMap).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      activityId: expect.any(String),
      locations,
      hideMap: true,
    });
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1', userId: 'user-1' },
      data: expect.objectContaining({
        hideMap: true,
        mapPhotoUrl: 'https://cdn.example.com/new-map.webp',
        routeOnlyMapPhotoUrl: 'https://cdn.example.com/new-route-only.webp',
      }),
    });
    expect(cleanup.enqueueObjectCleanup).toHaveBeenCalledWith('user-1', 'user-1/activities/activity-1/map.webp');
  });

  it('rejects a visibility change for a missing activity', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);
    prisma.activity.findFirst.mockResolvedValue(null);

    await expect(
      service.updateActivity({ ...activityDto, hideMap: true }, 'activity-missing', 'user-1'),
    ).rejects.toThrow('Активность не найдена');
    expect(prisma.activity.update).not.toHaveBeenCalled();
  });

  it('uses twenty activities as the default page size', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, { getAccountByUserId: asyncMock() } as never);
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);

    await service.getActivitesByUserId('user-1');
    expect(prisma.activity.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));

    await service.getAllActivitiesWithFriends('user-1');
    expect(prisma.$queryRaw.mock.calls.at(-1)?.slice(1)).toEqual([
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      true,
      null,
      null,
      null,
      21,
    ]);
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

  it('returns favorite activities with a stable cursor and owner filter', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    const newestDate = new Date('2026-08-12T23:15:00.000Z');
    const olderDate = new Date('2026-08-12T22:15:00.000Z');
    prisma.activity.findMany.mockResolvedValueOnce([
      { id: 'favorite-2', date: newestDate, isFavorite: true },
      { id: 'favorite-1', date: olderDate, isFavorite: true },
    ]);
    prisma.activity.findMany.mockResolvedValueOnce([{ id: 'favorite-1', date: olderDate, isFavorite: true }]);

    const firstPage = await service.getFavoriteActivities('user-1', '1');

    expect(firstPage).toMatchObject({ activities: [{ id: 'favorite-2', isFavorite: true }], hasMore: true });
    expect(firstPage?.nextCursor).toBe(encodeActivityCursor({ date: newestDate, id: 'favorite-2' }));
    expect(prisma.activity.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId: 'user-1', isFavorite: true, moderationStatus: 'visible' },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 2,
        select: expect.objectContaining({ isFavorite: true }),
      }),
    );

    const cursor = parseActivityCursor(firstPage!.nextCursor!);
    await expect(service.getFavoriteActivities('user-1', '1', cursor)).resolves.toMatchObject({
      activities: [{ id: 'favorite-1', isFavorite: true }],
      hasMore: false,
      nextCursor: null,
      isLastPage: true,
    });
    expect(prisma.activity.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          userId: 'user-1',
          isFavorite: true,
          moderationStatus: 'visible',
          OR: [{ date: { lt: newestDate } }, { date: newestDate, id: { lt: 'favorite-2' } }],
        },
        take: 2,
      }),
    );
  });

  it('allows only the activity owner to update the favorite state', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue({ userId: 'owner-1' });
    prisma.activity.update.mockResolvedValue({ id: 'activity-1', isFavorite: true });

    await expect(service.setActivityFavorite('activity-1', 'owner-1', true)).resolves.toEqual({
      id: 'activity-1',
      isFavorite: true,
    });
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: { isFavorite: true },
      select: { id: true, isFavorite: true },
    });

    await expect(service.setActivityFavorite('activity-1', 'another-user', true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    prisma.activity.findUnique.mockResolvedValue(null);
    await expect(service.setActivityFavorite('missing-activity', 'owner-1', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
          isFavorite: true,
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
    const feedQuery = Array.from(feedTemplate).join('');
    expect(feedQuery).toContain('a."emotion"');
    expect(feedQuery).toContain('a."is_favorite" AS "isFavorite"');
    expect(feedQuery).toContain("'profilePhoto', p." + '"profilePhoto"');
    expect(feedQuery).toContain("'profilePhotoPublishedKey'");
    expect(feedQuery).toContain(
      "profile_photo_asset.\"status\" IN ('queued', 'processing', 'review_required', 'approved')",
    );

    await service.getActivityByActivityId('activity-1');
    const detailQuery = ((prisma.activity.findUnique.mock.calls as unknown[][])[0]?.[0] ?? {}) as {
      select?: Record<string, unknown>;
    };
    expect(detailQuery.select).toEqual(expect.objectContaining({ description: true, kilometresSplit: true }));
  });

  it('uses the published moderation asset URL in activity cards and removes internal asset fields', async () => {
    const prisma = createPrismaMock();
    const storage = { getPublicUrl: (key: string) => 'https://cdn.example/' + key };
    const account = { getAccountByUserId: asyncMock().mockResolvedValue(null) };
    const service = new ActivityService(prisma as never, account as never, undefined, storage as never);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'activity-1',
        userId: 'friend-1',
        media: [],
        profile: {
          userId: 'friend-1',
          profilePhoto: null,
          profilePhotoBlurhash: 'pending-blurhash',
          profilePhotoReviewStatus: null,
          profilePhotoAssetStatus: 'approved',
          profilePhotoPublishedKey: 'friend-1/uploads/moderated/asset-1.webp',
        },
      },
    ]);

    const response = await service.getAllActivitiesWithFriends('viewer-1');

    expect(response.activities[0].profile).toMatchObject({
      userId: 'friend-1',
      profilePhoto: 'https://cdn.example/friend-1/uploads/moderated/asset-1.webp',
      profilePhotoBlurhash: 'pending-blurhash',
    });
    expect(response.activities[0].profile).not.toHaveProperty('profilePhotoAssetStatus');
    expect(response.activities[0].profile).not.toHaveProperty('profilePhotoPublishedKey');
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

  it('persists queued moderation references without requiring a public media URL', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);

    await expect(
      service.createActivity(
        {
          ...activityDto,
          media: [{ assetId: 'asset-1', thumbnailAssetId: 'thumbnail-1', mediaReviewStatus: 'queued' }],
        } as never,
        'user-1',
      ),
    ).rejects.toThrow('Сервис хранения проверяемого медиа не настроен');
  });

  it('builds only valid activity media rows and applies defaults to quarantined assets', () => {
    const service = new ActivityService(createPrismaMock() as never, {} as never);
    const getActivityMediaRows = (
      service as unknown as {
        getActivityMediaRows: (
          activityId: unknown,
          userId: unknown,
          activityDate: unknown,
          media: unknown,
        ) => Record<string, unknown>[];
      }
    ).getActivityMediaRows.bind(service);
    const activityDate = new Date('2026-10-21T12:00:00.000Z');

    expect(getActivityMediaRows(undefined, 'user-1', activityDate, [])).toEqual([]);
    expect(getActivityMediaRows('activity-1', undefined, activityDate, [])).toEqual([]);
    expect(getActivityMediaRows('activity-1', 'user-1', 42, [])).toEqual([]);
    expect(getActivityMediaRows('activity-1', 'user-1', activityDate, null)).toEqual([]);
    expect(
      getActivityMediaRows('activity-1', 'user-1', activityDate, [
        'https://cdn.example/photo.jpg',
        null,
        4,
        {},
        { url: 'https://cdn.example/photo-2.jpg', thumbnail: 'thumb', blurhash: 'hash' },
        { assetId: 'asset-1', thumbnailAssetId: 'thumb-asset-1' },
        { assetId: 'asset-2', url: 'https://cdn.example/approved.jpg', mediaReviewStatus: 'approved' },
      ]),
    ).toEqual([
      {
        activityId: 'activity-1',
        userId: 'user-1',
        activityDate,
        position: 0,
        url: 'https://cdn.example/photo.jpg',
        thumbnail: null,
        blurhash: null,
      },
      {
        activityId: 'activity-1',
        userId: 'user-1',
        activityDate,
        position: 4,
        url: 'https://cdn.example/photo-2.jpg',
        thumbnail: 'thumb',
        blurhash: 'hash',
      },
      {
        activityId: 'activity-1',
        userId: 'user-1',
        activityDate,
        position: 5,
        url: null,
        thumbnail: null,
        blurhash: null,
        mediaModerationAssetId: 'asset-1',
        thumbnailModerationAssetId: 'thumb-asset-1',
        mediaReviewStatus: 'queued',
      },
      {
        activityId: 'activity-1',
        userId: 'user-1',
        activityDate,
        position: 6,
        url: 'https://cdn.example/approved.jpg',
        thumbnail: null,
        blurhash: null,
        mediaModerationAssetId: 'asset-2',
        thumbnailModerationAssetId: null,
        mediaReviewStatus: 'approved',
      },
    ]);
  });
});
