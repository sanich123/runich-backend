import { NotFoundException } from '@nestjs/common';
import { FriendService } from '../friend.service';
import { asyncMock, expectInternalServerError } from 'src/tests/helpers';

function createPrismaMock() {
  return {
    friend: { findMany: asyncMock(), findUnique: asyncMock(), delete: asyncMock(), upsert: asyncMock() },
  };
}

describe('FriendService', () => {
  it('lists following users, followers, deletes and creates friendships', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue({ id: 'profile-1' }) };
    const service = new FriendService(prisma as never, account as never);
    prisma.friend.findMany.mockResolvedValueOnce([{ id: 'friend-1' }]).mockResolvedValueOnce([{ id: 'friend-2' }]);
    prisma.friend.delete.mockResolvedValue({ id: 'friend-1' });
    prisma.friend.upsert.mockResolvedValue({ id: 'friend-3' });

    await expect(service.getUsersYouFollowByUserId('user-1')).resolves.toEqual([{ id: 'friend-1' }]);
    await expect(service.getFollowers('user-1')).resolves.toEqual([{ id: 'friend-2' }]);
    await expect(service.deleteFriendById('friend-1')).resolves.toEqual({ id: 'friend-1' });
    await expect(service.addFriendByFriendId('friend-user', { userId: 'user-1' })).resolves.toEqual({ id: 'friend-3' });
    expect(prisma.friend.upsert).toHaveBeenCalledWith({
      where: { userId_friendId: { userId: 'user-1', friendId: 'friend-user' } },
      update: {},
      create: { userId: 'user-1', friendId: 'friend-user', profileId: 'profile-1' },
    });
  });

  it('returns not found when the target profile is missing', async () => {
    const prisma = createPrismaMock();
    const account = { getAccountByUserId: asyncMock().mockResolvedValue(null) };
    const service = new FriendService(prisma as never, account as never);

    await expect(service.addFriendByFriendId('friend-user', { userId: 'user-1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.friend.upsert).not.toHaveBeenCalled();
  });

  it('converts database failures from every operation to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
    Object.values(prisma.friend).forEach((operation) => operation.mockRejectedValue(error));
    const service = new FriendService(
      prisma as never,
      { getAccountByUserId: asyncMock().mockRejectedValue(error) } as never,
    );

    await expectInternalServerError(service.getUsersYouFollowByUserId('u1'));
    await expectInternalServerError(service.getFollowers('u1'));
    await expectInternalServerError(service.deleteFriendById('f1'));
    await expectInternalServerError(service.addFriendByFriendId('u2', { userId: 'u1' }));
  });
});
