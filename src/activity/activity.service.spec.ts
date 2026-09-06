import { ActivityService } from './activity.service';
import { asyncMock, expectInternalServerError } from 'src/__tests__/helpers';
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
    friend: { findMany: asyncMock() },
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
    prisma.activity.create.mockResolvedValue({ id: 'activity-1' });
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);

    await expect(service.createActivity({ ...activityDto }, 'user-1')).resolves.toEqual({ id: 'activity-1' });
    expect(prisma.activity.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ user_id: 'user-1', profileId: 'profile-1', mapPhotoUrlBlurhash: null }),
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
      where: { id: 'activity-1', user_id: 'activity-1' },
      data: expect.objectContaining({ steps: 1240 }),
    });
  });

  it('writes migration activities in chunks and skips duplicate records', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.createMany.mockResolvedValue({ count: 100 });
    const activities = Array.from({ length: 101 }, (_, index) => ({
      ...activityDto,
      title: 'Импортированная активность',
      user_id: 'user-1',
      profileId: 'profile-1',
      source: 'strava' as const,
      sourceActivityId: `strava-${index}`,
    }));

    await expect(service.createActivitiesFromMigrationArchive(activities)).resolves.toEqual({ success: true });
    expect(prisma.activity.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.activity.createMany).toHaveBeenCalledWith({ data: activities.slice(0, 100), skipDuplicates: true });
    expect(prisma.activity.createMany).toHaveBeenCalledWith({ data: activities.slice(100), skipDuplicates: true });
    await expect(service.createActivitiesFromMigrationArchive([])).resolves.toEqual({ success: true });
  });

  it('updates, reads, paginates and deletes activities', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, { getAccountByUserId: asyncMock() } as never);
    const activity = { id: 'activity-1' };
    prisma.activity.update.mockResolvedValue(activity);
    prisma.activity.findUnique.mockResolvedValue(activity);
    prisma.activity.findMany.mockResolvedValue([{ id: 'activity-1', photoVideoUrls: ['photo'] }]);
    prisma.friend.findMany.mockResolvedValue([{ friendId: 'friend-1' }]);
    prisma.activity.delete.mockResolvedValue(activity);

    await expect(service.updateActivity({ ...activityDto, title: 'Morning run' }, 'activity-1')).resolves.toEqual(
      activity,
    );
    await expect(service.getLocationsByActivityId('activity-1')).resolves.toEqual(activity);
    await expect(service.getActivityByActivityId('activity-1')).resolves.toEqual(activity);
    await expect(service.getMediaByUserId('user-1', '1')).resolves.toEqual({ photos: ['photo'], isLastPage: true });
    await expect(service.getActivitesByUserId('user-1', '2', '5')).resolves.toEqual({
      activities: [{ id: 'activity-1', photoVideoUrls: ['photo'] }],
      isLastPage: false,
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
    await expect(service.getAllActivitiesWithFriends('user-1', '1', '5')).resolves.toEqual({
      activities: [{ id: 'activity-1', photoVideoUrls: ['photo'] }],
      isLastPage: false,
    });
    await expect(service.deleteActivityById('activity-1')).resolves.toEqual(activity);
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
        { ...activityDto, user_id: 'u1', profileId: 'p1', source: 'strava', sourceActivityId: 's1' },
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
    prisma.friend.findMany.mockRejectedValue(error);
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
