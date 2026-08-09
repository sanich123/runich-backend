import { AccountService } from './account.service';
import { asyncMock, expectInternalServerError } from 'src/__tests__/helpers';

const pagination = { page: 0, limit: 2, size: 2, offset: 0 };
const filter = {
  name: 'Ann',
  surname: 'Smith',
  email: 'ann@example.com',
  city: 'Moscow',
  gender: 'female',
  sport: 'run',
};

function createPrismaMock() {
  return {
    $transaction: asyncMock(),
    profile: {
      count: asyncMock(),
      findMany: asyncMock(),
      update: asyncMock(),
      findUnique: asyncMock(),
      upsert: asyncMock(),
    },
  };
}

describe('AccountService', () => {
  it('returns all accounts with pagination metadata', async () => {
    const prisma = createPrismaMock();
    const profiles = [{ id: 'profile-1' }];
    prisma.$transaction.mockResolvedValue([1, profiles]);

    await expect(new AccountService(prisma as never).getAllAccounts(pagination)).resolves.toEqual({
      totalItems: 1,
      items: profiles,
      page: 0,
      size: 2,
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('handles filtered account pagination branches', async () => {
    const prisma = createPrismaMock();
    const service = new AccountService(prisma as never);
    const profiles = [{ id: 'profile-1' }, { id: 'profile-2' }];
    prisma.profile.findMany.mockResolvedValue(profiles);
    prisma.profile.count.mockResolvedValue(7);

    await expect(service.getFilteredAccounts(pagination, filter)).resolves.toEqual({
      totalItems: 7,
      items: profiles,
      page: 0,
      size: 2,
    });
    expect(prisma.profile.count).toHaveBeenCalledTimes(1);

    prisma.profile.findMany.mockResolvedValue([{ id: 'profile-1' }]);
    prisma.profile.count.mockClear();
    await expect(service.getFilteredAccounts(pagination, filter)).resolves.toEqual({
      totalItems: 1,
      items: [{ id: 'profile-1' }],
      page: 0,
      size: 2,
    });
    expect(prisma.profile.count).not.toHaveBeenCalled();

    prisma.profile.findMany.mockResolvedValue(profiles);
    prisma.profile.count.mockResolvedValue(9);
    await expect(service.getFilteredAccounts({ ...pagination, page: 1, offset: 2 }, filter)).resolves.toMatchObject({
      totalItems: 9,
      page: 1,
    });
  });

  it('updates, finds and upserts accounts', async () => {
    const prisma = createPrismaMock();
    const service = new AccountService(prisma as never);
    prisma.profile.update.mockResolvedValue({ id: 'profile-1', email: 'new@example.com' });
    prisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
    prisma.profile.upsert.mockResolvedValue({ id: 'profile-1' });

    await expect(
      service.updateProfileInfo({ email: 'new@example.com', emailNotifications: true }, 'profile-1'),
    ).resolves.toEqual({
      id: 'profile-1',
      email: 'new@example.com',
    });
    await expect(service.getAccountByUserId('user-1')).resolves.toEqual({ id: 'profile-1' });
    await expect(service.getOrCreateAccountByUserId('user-1')).resolves.toEqual({ id: 'profile-1' });
  });

  it('converts database failures from every method to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
    prisma.$transaction.mockRejectedValue(error);
    const service = new AccountService(prisma as never);

    await expectInternalServerError(service.getAllAccounts(pagination));

    prisma.profile.findMany.mockRejectedValue(error);
    await expectInternalServerError(service.getFilteredAccounts(pagination, filter));
    prisma.profile.findMany.mockReset();
    prisma.profile.findMany.mockResolvedValue([]);
    prisma.profile.update.mockRejectedValue(error);
    await expectInternalServerError(
      service.updateProfileInfo({ email: 'a@example.com', emailNotifications: true }, 'p1'),
    );
    prisma.profile.findUnique.mockRejectedValue(error);
    await expectInternalServerError(service.getAccountByUserId('u1'));
    prisma.profile.upsert.mockRejectedValue(error);
    await expectInternalServerError(service.getOrCreateAccountByUserId('u1'));
  });
});
