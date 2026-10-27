import { jest } from '@jest/globals';
import { AccountController } from '../account.controller';
import { AccountService } from '../account.service';
import { asyncMock } from 'src/tests/helpers';
import { makeAccountPage } from './fixtures';

describe('AccountController', () => {
  const service = {
    getFilteredAccounts: asyncMock(),
  };
  const controller = new AccountController(service as unknown as AccountService);

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for every endpoint', async () => {
    const profile = { id: 'profile-1' };
    const page = makeAccountPage([profile]);
    service.getFilteredAccounts.mockResolvedValue(page);

    await expect(controller.getFilteredAccounts(undefined, '10', { name: 'Ann' })).resolves.toEqual(page);
    expect(service.getFilteredAccounts).toHaveBeenCalledWith('10', undefined, { name: 'Ann' });
  });

  it('searches all profiles when no filter fields are supplied', async () => {
    service.getFilteredAccounts.mockResolvedValue({ items: [] });

    await expect(controller.getFilteredAccounts(undefined, undefined, {})).resolves.toEqual({ items: [] });
    expect(service.getFilteredAccounts).toHaveBeenCalledWith(undefined, undefined, {});
  });

  it('passes the current user id so they can find their own hidden profile', async () => {
    service.getFilteredAccounts.mockResolvedValue({ items: [] });

    await controller.getFilteredAccounts(undefined, '10', {}, { user: { id: 'owner-1' } } as never);

    expect(service.getFilteredAccounts).toHaveBeenCalledWith('10', undefined, {}, 'owner-1');
  });

  it('propagates service errors from every endpoint', async () => {
    const error = new Error('service failed');
    service.getFilteredAccounts.mockRejectedValue(error);

    await expect(controller.getFilteredAccounts(undefined, undefined, {})).rejects.toBe(error);
  });
});
