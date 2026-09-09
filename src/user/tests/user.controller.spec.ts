import { jest } from '@jest/globals';
import { UserController } from '../user.controller';
import { UserService } from '../user.service';
import { asyncMock } from 'src/tests/helpers';

describe('UserController', () => {
  const service = {
    getProfileByUserId: asyncMock(),
    createProfileByUserId: asyncMock(),
    updateProfileByUserId: asyncMock(),
  };
  const controller = new UserController(service as unknown as UserService);

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for every endpoint', async () => {
    const result = { id: 'profile-1' };
    service.getProfileByUserId.mockResolvedValue(result);
    service.createProfileByUserId.mockResolvedValue(result);
    service.updateProfileByUserId.mockResolvedValue(result);

    await expect(controller.getProfileByUserId({ id: 'u1' })).resolves.toEqual(result);
    await expect(controller.createProfileByUserId({ id: 'u1' }, { name: 'Ann' })).resolves.toEqual(result);
    await expect(controller.updateProfileByUserId({ id: 'u1' }, { name: 'Ann' })).resolves.toEqual(result);
  });

  it('propagates service errors from every endpoint', async () => {
    const error = new Error('service failed');
    Object.values(service).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.getProfileByUserId({ id: 'u1' })).rejects.toBe(error);
    await expect(controller.createProfileByUserId({ id: 'u1' }, {})).rejects.toBe(error);
    await expect(controller.updateProfileByUserId({ id: 'u1' }, {})).rejects.toBe(error);
  });
});
