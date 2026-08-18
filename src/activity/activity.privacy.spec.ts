import { ActivityService } from './activity.service';
import { asyncMock } from 'src/__tests__/helpers';

function createPrismaMock() {
  return {
    activity: {
      findUnique: asyncMock(),
      findMany: asyncMock(),
    },
  };
}

describe('ActivityService privacy', () => {
  it('limits another user to public activities, photos and locations', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.activity.findUnique.mockResolvedValue({
      user_id: 'owner-1',
      isPublic: false,
      locations: [{ coords: { latitude: 55, longitude: 37 } }],
      kilometresSplit: [],
    });

    await service.getActivitesByUserId('owner-1', '0', '10', 'viewer-1');
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'owner-1', isPublic: true } }),
    );

    await service.getMediaByUserId('owner-1', '10', 'viewer-1');
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'owner-1', photoVideoUrls: { not: null }, isPublic: true } }),
    );

    await expect(service.getLocationsByActivityId('activity-1', 'viewer-1')).resolves.toBeNull();
  });

  it('allows an owner to read private activity locations', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    const locations = [{ coords: { latitude: 55, longitude: 37 } }];
    prisma.activity.findUnique.mockResolvedValue({
      user_id: 'owner-1',
      isPublic: false,
      locations,
      kilometresSplit: [],
    });

    await expect(service.getLocationsByActivityId('activity-1', 'owner-1')).resolves.toEqual({
      locations,
      kilometresSplit: [],
    });
  });

  it('hides a private activity detail from another user', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityService(prisma as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue({ user_id: 'owner-1', isPublic: false });

    await expect(service.getActivityByActivityId('activity-1', 'viewer-1')).resolves.toBeNull();
  });
});
