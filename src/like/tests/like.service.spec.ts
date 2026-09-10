import { NotFoundException } from '@nestjs/common';
import { LikeService } from '../like.service';
import { asyncMock, expectInternalServerError } from 'src/tests/helpers';

function createPrismaMock() {
  return {
    activity: { findUnique: asyncMock() },
    like: { upsert: asyncMock(), findUnique: asyncMock(), delete: asyncMock(), findMany: asyncMock() },
  };
}

describe('LikeService', () => {
  it('creates, deletes and lists likes', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new LikeService(prisma as never, account as never, {} as never);
    prisma.like.upsert.mockResolvedValue({ id: 'like-1' });
    prisma.like.delete.mockResolvedValue({ id: 'like-1' });
    prisma.activity.findUnique.mockResolvedValue({ likes: [{ id: 'like-1' }] });

    await expect(service.addLike({ activityId: 'activity-1' })).resolves.toEqual({ id: 'like-1' });
    await expect(service.deleteLikeById('like-1')).resolves.toEqual({ id: 'like-1' });
    await expect(service.getLikesByActivityId('activity-1')).resolves.toEqual([{ id: 'like-1' }]);
    const listQuery = ((prisma.activity.findUnique.mock.calls as unknown[][])[0]?.[0] ?? {}) as {
      select?: { likes?: { select?: Record<string, unknown>; include?: unknown } };
      include?: unknown;
    };
    const likeQuery = listQuery.select?.likes ?? {};
    expect(listQuery.include).toBeUndefined();
    expect(likeQuery.include).toBeUndefined();
    expect(likeQuery.select).toEqual(
      expect.objectContaining({
        id: true,
        authorId: true,
        activityId: true,
        profile: expect.any(Object),
      }),
    );
    expect(prisma.like.findUnique).not.toHaveBeenCalled();
    expect(prisma.like.upsert).toHaveBeenCalledWith({
      where: { authorId_activityId: { authorId: '', activityId: 'activity-1' } },
      update: {},
      create: { profileId: 'profile-1', authorId: '', activityId: 'activity-1' },
    });
  });

  it('returns an existing like only for a unique-constraint race', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new LikeService(prisma as never, account as never, {} as never);
    const uniqueError = { code: 'P2002' };
    prisma.like.upsert.mockRejectedValue(uniqueError);
    prisma.like.findUnique.mockResolvedValue({ id: 'like-1' });

    await expect(service.addLike({ activityId: 'activity-1' })).resolves.toEqual({ id: 'like-1' });
    expect(prisma.like.findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns only the likes count for an accessible activity', async () => {
    const prisma = createPrismaMock();
    const service = new LikeService(prisma as never, {} as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue({ _count: { likes: 7 } });

    await expect(service.getLikesLengthByActivityId('activity-1', 'viewer-1')).resolves.toBe(7);
    expect(prisma.activity.findUnique).toHaveBeenCalledWith({
      where: { id: 'activity-1', OR: [{ userId: 'viewer-1' }, { isPublic: true }] },
      select: { _count: { select: { likes: true } } },
    });
  });

  it('returns not found when the author profile is missing', async () => {
    const prisma = createPrismaMock();
    const service = new LikeService(
      prisma as never,
      { getAccountByUserId: asyncMock().mockResolvedValue(null) } as never,
      {} as never,
    );

    await expect(service.addLike({ activityId: 'activity-1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.like.upsert).not.toHaveBeenCalled();
  });

  it('converts database failures from every operation to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
    prisma.activity.findUnique.mockRejectedValue(error);
    Object.values(prisma.like).forEach((operation) => operation.mockRejectedValue(error));
    const service = new LikeService(
      prisma as never,
      { getAccountByUserId: asyncMock().mockRejectedValue(error) } as never,
      {} as never,
    );

    await expectInternalServerError(service.addLike({ activityId: 'a1' }));
    await expectInternalServerError(service.deleteLikeById('l1'));
    await expectInternalServerError(service.getLikesByActivityId('a1'));
  });
});
