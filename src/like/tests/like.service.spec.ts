import { NotFoundException } from '@nestjs/common';
import { LikeService } from '../like.service';
import { parseLikeCursor } from '../like.pagination';
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
    await expect(service.getLikesByActivityId('activity-1')).resolves.toEqual({
      likes: [{ id: 'like-1' }],
      hasMore: false,
      nextCursor: null,
      currentUserLike: null,
    });
    const listQuery = ((prisma.activity.findUnique.mock.calls as unknown[][])[0]?.[0] ?? {}) as {
      select?: { likes?: { select?: Record<string, unknown>; include?: unknown; take?: number; orderBy?: unknown } };
      include?: unknown;
    };
    const likeQuery = listQuery.select?.likes ?? {};
    expect(listQuery.include).toBeUndefined();
    expect(likeQuery.include).toBeUndefined();
    expect(likeQuery.take).toBe(31);
    expect(likeQuery.orderBy).toEqual([{ date: 'desc' }, { id: 'desc' }]);
    expect(likeQuery.select).toEqual(
      expect.objectContaining({
        id: true,
        authorId: true,
        activityId: true,
        profile: expect.any(Object),
      }),
    );
    expect(likeQuery.select?.profile).toEqual(
      expect.objectContaining({ select: expect.objectContaining({ allowNewFollowers: true }) }),
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
    const service = new LikeService(
      prisma as never,
      {} as never,
      { canAccessActivityData: asyncMock().mockResolvedValue(true) } as never,
    );
    prisma.activity.findUnique.mockResolvedValue({ userId: 'owner-1', visibility: 'public', _count: { likes: 7 } });

    await expect(service.getLikesLengthByActivityId('activity-1', 'viewer-1')).resolves.toBe(7);
    expect(prisma.activity.findUnique).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      select: { userId: true, visibility: true, _count: { select: { likes: true } } },
    });
  });

  it('returns a page of newest likes and a cursor when more are available', async () => {
    const prisma = createPrismaMock();
    const service = new LikeService(prisma as never, {} as never, {} as never);
    const date = new Date('2026-08-22T10:00:00.000Z');
    prisma.activity.findUnique.mockResolvedValue({
      likes: [
        { id: 'like-3', date },
        { id: 'like-2', date },
        { id: 'like-1', date },
      ],
    });

    const result = await service.getLikesByActivityId('activity-1', undefined, '2', {
      date: new Date('2026-08-21T10:00:00.000Z'),
      id: 'cursor-like',
    });

    expect(result).toEqual({
      likes: [
        { id: 'like-3', date },
        { id: 'like-2', date },
      ],
      hasMore: true,
      nextCursor: expect.any(String),
      currentUserLike: null,
    });
    expect(parseLikeCursor(result?.nextCursor ?? undefined)).toEqual({ date, id: 'like-2' });
    expect(prisma.activity.findUnique).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      select: {
        userId: true,
        visibility: true,
        profile: { select: { allowLikesListViewing: true } },
        likes: expect.objectContaining({
          where: {
            OR: [
              { date: { lt: new Date('2026-08-21T10:00:00.000Z') } },
              { date: new Date('2026-08-21T10:00:00.000Z'), id: { lt: 'cursor-like' } },
            ],
          },
          take: 3,
        }),
      },
    });
  });

  it('returns the authenticated user like separately from the paginated list', async () => {
    const prisma = createPrismaMock();
    const service = new LikeService(
      prisma as never,
      {} as never,
      { canAccessActivityData: asyncMock().mockResolvedValue(true) } as never,
    );
    prisma.activity.findUnique.mockResolvedValue({
      userId: 'owner-1',
      visibility: 'public',
      profile: { allowLikesListViewing: true },
      likes: [],
    });
    prisma.like.findUnique.mockResolvedValue({ id: 'old-like-id', authorId: 'viewer-1' });

    const result = await service.getLikesByActivityId('activity-1', 'viewer-1');

    expect(result?.currentUserLike).toEqual({ id: 'old-like-id', authorId: 'viewer-1' });
    expect(prisma.like.findUnique).toHaveBeenCalledWith({
      where: { authorId_activityId: { authorId: 'viewer-1', activityId: 'activity-1' } },
      select: { id: true, authorId: true },
    });
  });

  it('returns zero for a missing activity when the count is requested without a user', async () => {
    const prisma = createPrismaMock();
    const service = new LikeService(prisma as never, {} as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue(null);

    await expect(service.getLikesLengthByActivityId('activity-1')).resolves.toBe(0);
    expect(prisma.activity.findUnique).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      select: { userId: true, visibility: true, _count: { select: { likes: true } } },
    });
  });

  it('rejects a count request for an inaccessible activity', async () => {
    const prisma = createPrismaMock();
    const service = new LikeService(
      prisma as never,
      {} as never,
      { canAccessActivity: asyncMock().mockResolvedValue(false) } as never,
    );
    prisma.activity.findUnique.mockResolvedValue(null);

    await expect(service.getLikesLengthByActivityId('activity-1', 'viewer-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
      { canAccessActivity: asyncMock().mockRejectedValue(error) } as never,
    );

    await expectInternalServerError(service.addLike({ activityId: 'a1' }));
    await expectInternalServerError(service.deleteLikeById('l1'));
    await expectInternalServerError(service.getLikesByActivityId('a1'));
    await expectInternalServerError(service.getLikesLengthByActivityId('a1', 'u1'));
  });
});
