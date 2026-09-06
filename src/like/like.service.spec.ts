import { NotFoundException } from '@nestjs/common';
import { LikeService } from './like.service';
import { asyncMock, expectInternalServerError } from 'src/__tests__/helpers';

function createPrismaMock() {
  return {
    like: { upsert: asyncMock(), findUnique: asyncMock(), delete: asyncMock(), findMany: asyncMock() },
  };
}

describe('LikeService', () => {
  it('creates, deletes and lists likes', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new LikeService(prisma as never, account as never, {} as never);
    prisma.like.upsert.mockResolvedValue({ id: 'like-1' });
    prisma.like.findUnique.mockResolvedValue({ id: 'like-1' });
    prisma.like.delete.mockResolvedValue({ id: 'like-1' });
    prisma.like.findMany.mockResolvedValue([{ id: 'like-1' }]);

    await expect(service.addLike({ activityId: 'activity-1' })).resolves.toEqual({ id: 'like-1' });
    await expect(service.deleteLikeById('like-1')).resolves.toEqual({ id: 'like-1' });
    await expect(service.getLikesByActivityId('activity-1')).resolves.toEqual([{ id: 'like-1' }]);
    expect(prisma.like.upsert).toHaveBeenCalledWith({
      where: { authorId_activityId: { authorId: '', activityId: 'activity-1' } },
      update: {},
      create: { profileId: 'profile-1', authorId: '', activityId: 'activity-1' },
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
