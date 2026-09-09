import { jest } from '@jest/globals';
import { FriendController } from '../friend.controller';
import { FriendService } from '../friend.service';
import { asyncMock } from 'src/tests/helpers';

describe('FriendController', () => {
  const service = {
    getUsersYouFollowByUserId: asyncMock(),
    deleteFriendById: asyncMock(),
    addFriendByFriendId: asyncMock(),
    getFollowers: asyncMock(),
  };
  const controller = new FriendController(service as unknown as FriendService);

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for all friendship endpoints', async () => {
    const result = [{ id: 'friend-1' }];
    service.getUsersYouFollowByUserId.mockResolvedValue(result);
    service.deleteFriendById.mockResolvedValue(result[0]);
    service.addFriendByFriendId.mockResolvedValue(result[0]);
    service.getFollowers.mockResolvedValue(result);

    await expect(controller.getUsersYouFollowByUserId({ id: 'u1' })).resolves.toEqual(result);
    await expect(controller.deleteFriendById({ id: 'f1' })).resolves.toEqual(result[0]);
    await expect(controller.createFrienById({ id: 'u2' }, { user: { id: 'u1' } } as never)).resolves.toEqual(result[0]);
    await expect(controller.getFollowers({ id: 'u1' })).resolves.toEqual(result);
  });

  it('propagates service errors from every friendship endpoint', async () => {
    const error = new Error('service failed');
    Object.values(service).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.getUsersYouFollowByUserId({ id: 'u1' })).rejects.toBe(error);
    await expect(controller.deleteFriendById({ id: 'f1' })).rejects.toBe(error);
    await expect(controller.createFrienById({ id: 'u2' }, { user: { id: 'u1' } } as never)).rejects.toBe(error);
    await expect(controller.getFollowers({ id: 'u1' })).rejects.toBe(error);
  });
});
