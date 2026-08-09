import { jest } from '@jest/globals';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { asyncMock } from 'src/__tests__/helpers';

describe('AccountController', () => {
  const service = {
    getAllAccounts: asyncMock(),
    getFilteredAccounts: asyncMock(),
    updateProfileInfo: asyncMock(),
    getAccountByUserId: asyncMock(),
  };
  const controller = new AccountController(service as unknown as AccountService);

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for every endpoint', async () => {
    const pagination = { page: 0, limit: 10, size: 10, offset: 0 };
    const profile = { id: 'profile-1' };
    service.getAllAccounts.mockResolvedValue({ items: [profile] });
    service.getFilteredAccounts.mockResolvedValue({ items: [profile] });
    service.updateProfileInfo.mockResolvedValue(profile);
    service.getAccountByUserId.mockResolvedValue(profile);

    await expect(controller.getAllAccounts(pagination)).resolves.toEqual({ items: [profile] });
    await expect(controller.getFilteredAccounts(pagination, { name: 'Ann' })).resolves.toEqual({ items: [profile] });
    await expect(
      controller.updateProfileInfo({ email: 'a@example.com', emailNotifications: true }, { id: 'p1' }),
    ).resolves.toEqual(profile);
    await expect(controller.getAccountByUserId({ id: 'u1' })).resolves.toEqual(profile);
    expect(service.getAllAccounts).toHaveBeenCalledWith(pagination);
    expect(service.getFilteredAccounts).toHaveBeenCalledWith(pagination, { name: 'Ann' });
  });

  it('returns undefined and does not call the service when no filter is supplied', async () => {
    await expect(controller.getFilteredAccounts({ page: 0, limit: 10, size: 10, offset: 0 })).resolves.toBeUndefined();
    expect(service.getFilteredAccounts).not.toHaveBeenCalled();
  });

  it('propagates service errors from every endpoint', async () => {
    const error = new Error('service failed');
    service.getAllAccounts.mockRejectedValue(error);
    service.getFilteredAccounts.mockRejectedValue(error);
    service.updateProfileInfo.mockRejectedValue(error);
    service.getAccountByUserId.mockRejectedValue(error);

    await expect(controller.getAllAccounts({ page: 0, limit: 10, size: 10, offset: 0 })).rejects.toBe(error);
    await expect(controller.getFilteredAccounts({ page: 0, limit: 10, size: 10, offset: 0 }, {})).rejects.toBe(error);
    await expect(
      controller.updateProfileInfo({ email: 'a@example.com', emailNotifications: true }, { id: 'p1' }),
    ).rejects.toBe(error);
    await expect(controller.getAccountByUserId({ id: 'u1' })).rejects.toBe(error);
  });
});
