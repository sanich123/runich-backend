import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LikeService } from '../like.service';
import { asyncMock } from 'src/tests/helpers';

describe('LikeService privacy', () => {
  it('does not create or list likes for a private activity', async () => {
    const prisma = {
      activity: { findUnique: asyncMock().mockResolvedValue(null) },
      like: { upsert: asyncMock(), findMany: asyncMock() },
    };
    const accountService = { getAccountByUserId: asyncMock() };
    const activityService = { canAccessActivity: asyncMock().mockResolvedValue(false) };
    const service = new LikeService(prisma as never, accountService as never, activityService as never);

    await expect(service.addLike({ activityId: 'activity-1' }, 'viewer-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getLikesByActivityId('activity-1', 'viewer-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.like.upsert).not.toHaveBeenCalled();
    expect(prisma.like.findMany).not.toHaveBeenCalled();
  });

  it('rejects external likes when the activity owner disabled interactions', async () => {
    const prisma = {
      activity: { findUnique: asyncMock() },
      like: { upsert: asyncMock(), findMany: asyncMock() },
    };
    const accountService = { getAccountByUserId: asyncMock() };
    const activityService = {
      canAccessActivity: asyncMock().mockResolvedValue(true),
      canInteractWithActivity: asyncMock().mockResolvedValue(false),
    };
    const service = new LikeService(prisma as never, accountService as never, activityService as never);

    await expect(service.addLike({ activityId: 'activity-1' }, 'viewer-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.like.upsert).not.toHaveBeenCalled();
    expect(accountService.getAccountByUserId).not.toHaveBeenCalled();
  });
});
