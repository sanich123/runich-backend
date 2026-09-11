import { ActivityService } from '../activity.service';
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
  return {
    activity: {
      create: asyncMock(),
      createMany: asyncMock(),
      update: asyncMock(),
      findUnique: asyncMock(),
      findMany: asyncMock(),
      delete: asyncMock(),
    },
    $transaction: jest.fn(),
    friend: { findMany: asyncMock() },
    $queryRaw: asyncMock(),
  };
}

describe('ActivityService', () => {
  const originalMapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalMapboxToken === undefined) delete process.env.MAPBOX_ACCESS_TOKEN;
    else process.env.MAPBOX_ACCESS_TOKEN = originalMapboxToken;
  });

  it('creates activities with and without a generated map image', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new ActivityService(prisma as never, account as never);
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
    await service.createActivity(
      { ...activityDto, locations, photoVideoUrls: [{ url: 'photo', thumbnail: null }] },
      'user-1',
    );
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ mapPhotoUrl: expect.stringContaining('mapbox-token') }),
    });
  });

  it('stores a route in S3 and keeps only route metadata in the activity row', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const storage = {
      uploadActivityRoute: asyncMock().mockResolvedValue({
        key: 'user-1/activities/activity-1/route-v1.json.gz',
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
        routeStorageKey: 'user-1/activities/activity-1/route-v1.json.gz',
        routeFormatVersion: 1,
        routePointCount: 1,
        routeSizeBytes: 123,
        routeChecksum: 'a'.repeat(64),
      }),
    });
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.not.objectContaining({ locations: expect.anything() }),
    });
  });

  it('removes an uploaded route when the activity row cannot be saved', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const storage = {
      uploadActivityRoute: asyncMock().mockResolvedValue({ key: 'user-1/activities/activity-1/route-v1.json.gz' }),
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

    expect(storage.deleteObjectByKey).toHaveBeenCalledWith('user-1/activities/activity-1/route-v1.json.gz');
  });

  it('queues every S3 object linked to an activity before deleting its row', async () => {
    const prisma = createPrismaMock();
    const transaction = {
      activity: { findFirst: asyncMock(), delete: asyncMock() },
    };
    prisma.$transaction.mockImplementation((async (callback: (client: unknown) => Promise<unknown>) =>
      callback(transaction)) as never);
    transaction.activity.findFirst.mockResolvedValue({
      routeStorageKey: 'user-1/activities/activity-1/route-v1.json.gz',
      photoVideoUrls: [
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
      'user-1/activities/activity-1/route-v1.json.gz',
      transaction,
    );
    expect(cleanup.enqueueObjectCleanup).toHaveBeenCalledWith('user-1', 'user-1/photo.jpg', transaction);
    expect(cleanup.enqueueObjectCleanup).toHaveBeenCalledWith('user-1', 'user-1/photo-thumb.jpg', transaction);
    expect(transaction.activity.delete).toHaveBeenCalledWith({ where: { id: 'activity-1', userId: 'user-1' } });
  });

  it('reads a stored route while keeping the locations endpoint response unchanged', async () => {
    const prisma = createPrismaMock();
    const storage = { readActivityRoute: asyncMock().mockResolvedValue([{ coords: { latitude: 55, longitude: 37 } }]) };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never);
    prisma.activity.findUnique.mockResolvedValue({
      routeStorageKey: 'user-1/activities/activity-1/route-v1.json.gz',
      kilometresSplit: [],
      userId: 'user-1',
      isPublic: false,
    });

    await expect(service.getLocationsByActivityId('activity-1', 'user-1')).resolves.toEqual({
      locations: [{ coords: { latitude: 55, longitude: 37 } }],
      kilometresSplit: [],
    });
    expect(storage.readActivityRoute).toHaveBeenCalledWith('user-1/activities/activity-1/route-v1.json.gz');
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
      { ...activityDto, sport: 'ride', date: '2026-08-12T23:15:00', title: undefined },
      'user-1',
    );
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ title: 'Вечерний велозаезд' }),
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
        isPublic: undefined,
        emotion: undefined,
        date: undefined,
        description: null,
        distance: 1000,
        duration: 100,
        speed: 10,
      },
    });
  });

  it('writes migration activities in chunks and skips duplicate records', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.createMany.mockResolvedValueOnce({ count: 100 }).mockResolvedValueOnce({ count: 1 });
    const activities = Array.from({ length: 101 }, (_, index) => ({
      ...activityDto,
      title: 'Импортированная активность',
      userId: 'user-1',
      profileId: 'profile-1',
      source: 'strava' as const,
      sourceActivityId: `strava-${index}`,
    }));

    await expect(service.createActivitiesFromMigrationArchive(activities)).resolves.toEqual({
      success: true,
      importedActivities: 101,
    });
    expect(prisma.activity.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.activity.createMany).toHaveBeenCalledWith({ data: activities.slice(0, 100), skipDuplicates: true });
    expect(prisma.activity.createMany).toHaveBeenCalledWith({ data: activities.slice(100), skipDuplicates: true });
    await expect(service.createActivitiesFromMigrationArchive([])).resolves.toEqual({
      success: true,
      importedActivities: 0,
    });
  });

  it('uploads imported activity routes and stores only their metadata', async () => {
    const prisma = createPrismaMock();
    const storage = {
      uploadActivityRoute: asyncMock().mockResolvedValue({
        key: 'user-1/activities/activity-1/route-v1.json.gz',
        formatVersion: 1,
        pointCount: 2,
        sizeBytes: 123,
        checksum: 'a'.repeat(64),
      }),
      deleteObjectByKey: asyncMock(),
    };
    const service = new ActivityService(prisma as never, {} as never, undefined, storage as never);
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
    prisma.activity.createMany.mockResolvedValue({ count: 1 });

    await expect(service.createActivitiesFromMigrationArchive([activity])).resolves.toEqual({
      success: true,
      importedActivities: 1,
    });

    expect(storage.uploadActivityRoute).toHaveBeenCalledWith('user-1', 'activity-1', locations);
    expect(prisma.activity.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'activity-1',
          description: 'Imported activity description',
          routeStorageKey: 'user-1/activities/activity-1/route-v1.json.gz',
          routeFormatVersion: 1,
          routePointCount: 2,
          routeSizeBytes: 123,
          routeChecksum: 'a'.repeat(64),
        }),
      ],
      skipDuplicates: true,
    });
    const createManyInput = (
      prisma.activity.createMany.mock.calls as unknown as Array<[{ data: Record<string, unknown>[] }]>
    )[0]?.[0];
    expect(createManyInput).toBeDefined();
    expect(createManyInput!.data[0]).not.toHaveProperty('locations');
  });

  it('updates, reads, paginates and deletes activities', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, { getAccountByUserId: asyncMock() } as never);
    const activity = { id: 'activity-1' };
    prisma.activity.update.mockResolvedValue(activity);
    prisma.activity.findUnique.mockResolvedValue(activity);
    prisma.activity.findMany.mockResolvedValue([{ id: 'activity-1', photoVideoUrls: ['photo'] }]);
    prisma.$queryRaw.mockResolvedValue([{ id: 'activity-1', photoVideoUrls: ['photo'] }]);
    prisma.activity.delete.mockResolvedValue(activity);

    await expect(service.updateActivity({ ...activityDto, title: 'Morning run' }, 'activity-1')).resolves.toEqual(
      activity,
    );
    await expect(service.getLocationsByActivityId('activity-1')).resolves.toEqual(activity);
    await expect(service.getActivityByActivityId('activity-1')).resolves.toEqual(activity);
    await expect(service.getMediaByUserId('user-1', '1')).resolves.toEqual({
      photos: ['photo'],
      hasMore: false,
      nextCursor: null,
      isLastPage: true,
    });
    await expect(service.getActivitesByUserId('user-1', '5')).resolves.toEqual({
      activities: [{ id: 'activity-1', photoVideoUrls: ['photo'] }],
      hasMore: false,
      nextCursor: null,
      isLastPage: true,
    });
    await expect(service.getActivitiesByTheirIds(['activity-1', 'activity-2'])).resolves.toEqual([
      { id: 'activity-1', photoVideoUrls: ['photo'] },
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
      activities: [{ id: 'activity-1', photoVideoUrls: ['photo'] }],
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

    prisma.activity.findMany.mockResolvedValueOnce([
      { id: 'activity-2', date: newestDate, photoVideoUrls: ['photo-1', 'photo-2'] },
      { id: 'activity-1', date: olderDate, photoVideoUrls: ['photo-3'] },
    ]);
    const mediaPage = await service.getMediaByUserId('user-1', '1');
    expect(mediaPage).toMatchObject({ photos: ['photo-1'], hasMore: true });
    const mediaCursor = parseActivityMediaCursor(mediaPage?.nextCursor ?? undefined);
    expect(mediaCursor).toEqual({ date: newestDate, id: 'activity-2', photoIndex: 0 });

    prisma.activity.findMany.mockResolvedValueOnce([
      { id: 'activity-2', date: newestDate, photoVideoUrls: ['photo-1', 'photo-2'] },
      { id: 'activity-1', date: olderDate, photoVideoUrls: ['photo-3'] },
    ]);
    await expect(service.getMediaByUserId('user-1', '1', mediaCursor)).resolves.toMatchObject({
      photos: ['photo-2'],
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
          photoVideoUrls: true,
          mapPhotoUrl: true,
          duration: true,
          distance: true,
          profile: expect.any(Object),
          _count: expect.any(Object),
        }),
      );
      expect(query.select).not.toHaveProperty('locations');
      expect(query.select).not.toHaveProperty('kilometresSplit');
      expect(query.select).not.toHaveProperty('emotion');
      expect(query.select).not.toHaveProperty('description');
    }

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
    prisma.activity.createMany.mockRejectedValue(error);
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
