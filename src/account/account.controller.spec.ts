import { jest } from '@jest/globals';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { asyncMock } from 'src/__tests__/helpers';

describe('AccountController', () => {
  const service = {
    getFilteredAccounts: asyncMock(),
  };
  const controller = new AccountController(service as unknown as AccountService);

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for every endpoint', async () => {
    const pagination = { page: 0, limit: 10, size: 10, offset: 0 };
    const profile = { id: 'profile-1' };
    service.getFilteredAccounts.mockResolvedValue({ items: [profile] });

    await expect(controller.getFilteredAccounts(pagination, { name: 'Ann' })).resolves.toEqual({ items: [profile] });
    expect(service.getFilteredAccounts).toHaveBeenCalledWith(pagination, { name: 'Ann' });
  });

  it('returns undefined and does not call the service when no filter is supplied', async () => {
    await expect(controller.getFilteredAccounts({ page: 0, limit: 10, size: 10, offset: 0 })).resolves.toBeUndefined();
    expect(service.getFilteredAccounts).not.toHaveBeenCalled();
  });

  it('propagates service errors from every endpoint', async () => {
    const error = new Error('service failed');
    service.getFilteredAccounts.mockRejectedValue(error);

    await expect(controller.getFilteredAccounts({ page: 0, limit: 10, size: 10, offset: 0 }, {})).rejects.toBe(error);
  });
});
