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
  };
}

describe('ActivityService privacy', () => {
  it('limits another user to public activities, photos and locations', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.activityMedia.findMany.mockResolvedValue([]);
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
});
