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
      findUnique: asyncMock(),
      upsert: asyncMock(),
    },
  };
}

describe('AccountService', () => {
  it('searches by name, surname and partial email using the same query', async () => {
    const prisma = createPrismaMock();
    const service = new AccountService(prisma as never);
    const profile = { id: 'profile-1' };
    const searchFields = [
      { filter: { name: 'Alexander' }, term: 'Alexander' },
      { filter: { surname: 'Voronin' }, term: 'Voronin' },
      { filter: { email: 'aovoronin.piano' }, term: 'aovoronin.piano' },
    ];

    for (const { filter, term } of searchFields) {
      prisma.$transaction.mockResolvedValue([1, [profile]]);

      await expect(service.getFilteredAccounts(pagination, filter)).resolves.toEqual({
        totalItems: 1,
        items: [profile],
        page: 0,
        size: 2,
      });

      const expectedWhere = {
        AND: [
          {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { surname: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
              { users: { email: { contains: term, mode: 'insensitive' } } },
            ],
          },
        ],
      };
      expect(prisma.profile.count).toHaveBeenLastCalledWith({ where: expectedWhere });
      expect(prisma.profile.findMany).toHaveBeenLastCalledWith({
        where: expectedWhere,
        skip: 0,
        take: 2,
      });
    }
  });

  it('requires every word of a full-name search and ignores blank values', async () => {
    const prisma = createPrismaMock();
    const service = new AccountService(prisma as never);
    prisma.$transaction.mockResolvedValue([0, []]);

    await expect(service.getFilteredAccounts(pagination, { name: '  Alexander   Voronin  ' })).resolves.toMatchObject({
      totalItems: 0,
      items: [],
    });

    expect(prisma.profile.count).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: 'Alexander', mode: 'insensitive' } },
              { surname: { contains: 'Alexander', mode: 'insensitive' } },
              { email: { contains: 'Alexander', mode: 'insensitive' } },
              { users: { email: { contains: 'Alexander', mode: 'insensitive' } } },
            ],
          },
          {
            OR: [
              { name: { contains: 'Voronin', mode: 'insensitive' } },
              { surname: { contains: 'Voronin', mode: 'insensitive' } },
              { email: { contains: 'Voronin', mode: 'insensitive' } },
              { users: { email: { contains: 'Voronin', mode: 'insensitive' } } },
            ],
          },
        ],
      },
    });

    prisma.$transaction.mockResolvedValue([3, [{ id: 'profile-1' }]]);
    await expect(service.getFilteredAccounts(pagination, { name: '   ' })).resolves.toMatchObject({
      totalItems: 3,
    });
    expect(prisma.profile.count).toHaveBeenLastCalledWith({ where: {} });
  });

  it('finds and upserts accounts', async () => {
    const prisma = createPrismaMock();
    const service = new AccountService(prisma as never);
    prisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
    prisma.profile.upsert.mockResolvedValue({ id: 'profile-1' });

    await expect(service.getAccountByUserId('user-1')).resolves.toEqual({ id: 'profile-1' });
    await expect(service.getOrCreateAccountByUserId('user-1')).resolves.toEqual({ id: 'profile-1' });
  });

  it('converts database failures from every method to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
    prisma.$transaction.mockRejectedValue(error);
    const service = new AccountService(prisma as never);

    await expectInternalServerError(service.getFilteredAccounts(pagination, filter));
    prisma.profile.findUnique.mockRejectedValue(error);
    await expectInternalServerError(service.getAccountByUserId('u1'));
    prisma.profile.upsert.mockRejectedValue(error);
    await expectInternalServerError(service.getOrCreateAccountByUserId('u1'));
  });
});
