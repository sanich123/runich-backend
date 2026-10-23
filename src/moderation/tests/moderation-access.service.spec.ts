import { asyncMock } from 'src/tests/helpers';
import { ModerationAccessService } from '../moderation-access.service';

describe('ModerationAccessService', () => {
  it('checks blocks in either direction and lists the other user from each relation', async () => {
    const prisma = {
      userBlock: { findFirst: asyncMock(), findMany: asyncMock() },
    };
    const service = new ModerationAccessService(prisma as never);

    await expect(service.areBlocked('user-1', 'user-1')).resolves.toBe(false);
    expect(prisma.userBlock.findFirst).not.toHaveBeenCalled();
    prisma.userBlock.findFirst.mockResolvedValue(null);
    await expect(service.areBlocked('user-1', 'user-2')).resolves.toBe(false);
    prisma.userBlock.findFirst.mockResolvedValue({ id: 'block-1' });
    await expect(service.areBlocked('user-1', 'user-2')).resolves.toBe(true);
    expect(prisma.userBlock.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { blockerId: 'user-1', blockedId: 'user-2' },
          { blockerId: 'user-2', blockedId: 'user-1' },
        ],
      },
      select: { id: true },
    });

    prisma.userBlock.findMany.mockResolvedValue([
      { blockerId: 'viewer-1', blockedId: 'blocked-1' },
      { blockerId: 'blocker-2', blockedId: 'viewer-1' },
    ]);
    await expect(service.getBlockedUserIds('viewer-1')).resolves.toEqual(['blocked-1', 'blocker-2']);
    expect(prisma.userBlock.findMany).toHaveBeenCalledWith({
      where: { OR: [{ blockerId: 'viewer-1' }, { blockedId: 'viewer-1' }] },
      select: { blockerId: true, blockedId: true },
    });
  });

  it('remains safe when the block model is not available', async () => {
    const service = new ModerationAccessService({} as never);

    await expect(service.areBlocked('user-1', 'user-2')).resolves.toBe(false);
    await expect(service.getBlockedUserIds('user-1')).resolves.toEqual([]);
  });
});
