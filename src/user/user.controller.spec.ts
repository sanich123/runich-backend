import { jest } from '@jest/globals';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { asyncMock } from 'src/__tests__/helpers';

describe('UserController', () => {
  const service = {
    getAllUsers: asyncMock(),
    getProfileByUserId: asyncMock(),
    createProfileByUserId: asyncMock(),
    updateProfileByProfileId: asyncMock(),
  };
  const controller = new UserController(service as unknown as UserService);

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for every endpoint', async () => {
    const result = { id: 'profile-1' };
    service.getAllUsers.mockResolvedValue([result]);
    service.getProfileByUserId.mockResolvedValue(result);
    service.createProfileByUserId.mockResolvedValue(result);
    service.updateProfileByProfileId.mockResolvedValue(result);

    await expect(controller.getAllUsers()).resolves.toEqual([result]);
    await expect(controller.getProfileByUserId({ id: 'u1' })).resolves.toEqual(result);
    await expect(controller.createProfileByUserId({ id: 'u1' }, { name: 'Ann' })).resolves.toEqual(result);
    await expect(controller.updateProfileByProfileId({ id: 'p1' }, { name: 'Ann' })).resolves.toEqual(result);
  });

  it('propagates service errors from every endpoint', async () => {
    const error = new Error('service failed');
    Object.values(service).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.getAllUsers()).rejects.toBe(error);
    await expect(controller.getProfileByUserId({ id: 'u1' })).rejects.toBe(error);
    await expect(controller.createProfileByUserId({ id: 'u1' }, {})).rejects.toBe(error);
    await expect(controller.updateProfileByProfileId({ id: 'p1' }, {})).rejects.toBe(error);
  });
});
