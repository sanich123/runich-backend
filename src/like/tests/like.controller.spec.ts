import { jest } from '@jest/globals';
import { LikeController } from '../like.controller';
import { LikeService } from '../like.service';
import { asyncMock } from 'src/tests/helpers';

describe('LikeController', () => {
  const service = {
    addLike: asyncMock(),
    deleteLikeById: asyncMock(),
    getLikesByActivityId: asyncMock(),
  };
  const controller = new LikeController(service as unknown as LikeService);

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for every like endpoint', async () => {
    const like = { id: 'like-1' };
    service.addLike.mockResolvedValue(like);
    service.deleteLikeById.mockResolvedValue(like);
    service.getLikesByActivityId.mockResolvedValue([like]);

    await expect(controller.sendOrDeleteLike({ activityId: 'a1' })).resolves.toEqual(like);
    await expect(controller.deleteLike({ id: 'like-1' }, undefined)).resolves.toEqual(like);
    await expect(controller.getLikesByActivityId({ id: 'a1' })).resolves.toEqual([like]);
  });

  it('propagates service errors from every like endpoint', async () => {
    const error = new Error('service failed');
    Object.values(service).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.sendOrDeleteLike({ activityId: 'a1' })).rejects.toBe(error);
    await expect(controller.deleteLike({ id: 'like-1' }, undefined)).rejects.toBe(error);
    await expect(controller.getLikesByActivityId({ id: 'a1' })).rejects.toBe(error);
  });
});
