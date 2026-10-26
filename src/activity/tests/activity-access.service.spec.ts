import { jest } from '@jest/globals';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ActivityAccessService } from '../services/activity-access.service';
import { ACTIVITY_VISIBLE_TO_FOLLOWERS, ACTIVITY_VISIBILITY } from '../activity-visibility';

describe('ActivityAccessService', () => {
  const prisma = {
    friend: { findUnique: jest.fn<(args: unknown) => Promise<unknown>>() },
    activity: { findUnique: jest.fn<(args: unknown) => Promise<unknown>>() },
    userBlock: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };
  const service = new ActivityAccessService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not query a follower relation for the owner', async () => {
    await expect(service.isFollower('user-1', 'user-1')).resolves.toBe(false);
    expect(prisma.friend.findUnique).not.toHaveBeenCalled();
  });

  it('checks the directed follower relation', async () => {
    prisma.friend.findUnique.mockResolvedValueOnce({ id: 'relation-1' });
    await expect(service.isFollower('viewer-1', 'owner-1')).resolves.toBe(true);
    expect(prisma.friend.findUnique).toHaveBeenCalledWith({
      where: { userId_friendId: { userId: 'viewer-1', friendId: 'owner-1' } },
      select: { id: true },
    });

    prisma.friend.findUnique.mockResolvedValueOnce(null);
    await expect(service.isFollower('viewer-2', 'owner-1')).resolves.toBe(false);
  });

  it('builds visibility filters for anonymous, owner, follower, and public viewers', async () => {
    await expect(service.getVisibilityFilter('owner-1')).resolves.toEqual({});
    await expect(service.getVisibilityFilter('owner-1', 'owner-1')).resolves.toEqual({});

    prisma.friend.findUnique.mockResolvedValueOnce({ id: 'relation-1' });
    await expect(service.getVisibilityFilter('owner-1', 'viewer-1')).resolves.toEqual({
      visibility: { in: ACTIVITY_VISIBLE_TO_FOLLOWERS },
    });

    prisma.friend.findUnique.mockResolvedValueOnce(null);
    await expect(service.getVisibilityFilter('owner-1', 'viewer-2')).resolves.toEqual({
      visibility: ACTIVITY_VISIBILITY.public,
    });
  });

  it('allows access to public and owned activities and checks follower-only activities', async () => {
    await expect(service.canAccessActivityData(null, 'viewer-1')).resolves.toBe(false);
    await expect(service.canAccessActivityData({ userId: 'owner-1', visibility: 'followers' })).resolves.toBe(false);
    await expect(
      service.canAccessActivityData({ userId: 'owner-1', visibility: 'followers' }, 'owner-1'),
    ).resolves.toBe(true);
    await expect(
      service.canAccessActivityData({ userId: 'owner-1', visibility: ACTIVITY_VISIBILITY.public }, 'viewer-1'),
    ).resolves.toBe(true);

    prisma.friend.findUnique.mockResolvedValueOnce({ id: 'relation-1' });
    await expect(
      service.canAccessActivityData({ userId: 'owner-1', visibility: ACTIVITY_VISIBILITY.followers }, 'viewer-1'),
    ).resolves.toBe(true);
  });

  it('allows interaction for the owner and follows the profile interaction setting for others', async () => {
    prisma.activity.findUnique
      .mockResolvedValueOnce({
        userId: 'viewer-1',
        moderationStatus: 'visible',
        profile: { allowActivityInteractions: false },
      })
      .mockResolvedValueOnce({
        userId: 'owner-1',
        moderationStatus: 'visible',
        profile: { allowActivityInteractions: false },
      })
      .mockResolvedValueOnce({
        userId: 'owner-1',
        moderationStatus: 'visible',
        profile: { allowActivityInteractions: true },
      })
      .mockResolvedValueOnce(null);

    await expect(service.canInteractWithActivity('activity-1', 'viewer-1')).resolves.toBe(true);
    await expect(service.canInteractWithActivity('activity-1', 'viewer-1')).resolves.toBe(false);
    await expect(service.canInteractWithActivity('activity-1', 'viewer-1')).resolves.toBe(true);
    await expect(service.canInteractWithActivity('activity-1', 'viewer-1')).resolves.toBe(false);
  });
});
