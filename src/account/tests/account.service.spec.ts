import { AccountService } from '../account.service';
import { asyncMock, expectInternalServerError } from 'src/tests/helpers';
import { parseProfileCursor } from '../account.pagination';

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
      prisma.profile.findMany.mockResolvedValue([profile]);

      await expect(service.getFilteredAccounts('2', undefined, filter)).resolves.toEqual({
        items: [profile],
        hasMore: false,
        nextCursor: null,
      });

      const expectedWhere = {
        AND: [
          {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { surname: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
              { user: { email: { contains: term, mode: 'insensitive' } } },
            ],
          },
        ],
      };
      expect(prisma.profile.findMany).toHaveBeenLastCalledWith({
        where: expectedWhere,
        orderBy: { id: 'asc' },
        take: 3,
      });
    }
  });

  it('requires every word of a full-name search and ignores blank values', async () => {
    const prisma = createPrismaMock();
    const service = new AccountService(prisma as never);
    prisma.profile.findMany.mockResolvedValue([]);

    await expect(
      service.getFilteredAccounts('2', undefined, { name: '  Alexander   Voronin  ' }),
    ).resolves.toMatchObject({
      items: [],
    });

    expect(prisma.profile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { name: { contains: 'Alexander', mode: 'insensitive' } },
                { surname: { contains: 'Alexander', mode: 'insensitive' } },
                { email: { contains: 'Alexander', mode: 'insensitive' } },
                { user: { email: { contains: 'Alexander', mode: 'insensitive' } } },
              ],
            },
            {
              OR: [
                { name: { contains: 'Voronin', mode: 'insensitive' } },
                { surname: { contains: 'Voronin', mode: 'insensitive' } },
                { email: { contains: 'Voronin', mode: 'insensitive' } },
                { user: { email: { contains: 'Voronin', mode: 'insensitive' } } },
              ],
            },
          ],
        },
      }),
    );

    prisma.profile.findMany.mockResolvedValue([{ id: 'profile-1' }]);
    await expect(service.getFilteredAccounts('2', undefined, { name: '   ' })).resolves.toMatchObject({
      hasMore: false,
    });
  });

  it('finds and upserts accounts', async () => {
    const prisma = createPrismaMock();
    const service = new AccountService(prisma as never);
    prisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
    prisma.profile.upsert.mockResolvedValue({ id: 'profile-1' });

    await expect(service.getAccountByUserId('user-1')).resolves.toEqual({ id: 'profile-1' });
    await expect(service.getOrCreateAccountByUserId('user-1')).resolves.toEqual({ id: 'profile-1' });
  });

  it('uses the last profile id as a cursor', async () => {
    const prisma = createPrismaMock();
    const service = new AccountService(prisma as never);
    prisma.profile.findMany.mockResolvedValueOnce([{ id: 'profile-1' }, { id: 'profile-2' }]);

    const firstPage = await service.getFilteredAccounts('1', undefined, {});
    expect(firstPage).toMatchObject({ items: [{ id: 'profile-1' }], hasMore: true });
    const cursor = parseProfileCursor(firstPage?.nextCursor ?? undefined);
    expect(cursor).toEqual({ id: 'profile-1' });
    expect(prisma.profile.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: { id: 'asc' }, take: 2 }),
    );

    prisma.profile.findMany.mockResolvedValueOnce([{ id: 'profile-2' }]);
    await expect(service.getFilteredAccounts('1', cursor, {})).resolves.toMatchObject({
      items: [{ id: 'profile-2' }],
      hasMore: false,
      nextCursor: null,
    });
    expect(prisma.profile.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { AND: [{}, { id: { gt: 'profile-1' } }] } }),
    );
  });

  it('converts database failures from every method to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
    prisma.profile.findMany.mockRejectedValue(error);
    const service = new AccountService(prisma as never);

    await expectInternalServerError(service.getFilteredAccounts('2', undefined, filter));
    prisma.profile.findUnique.mockRejectedValue(error);
    await expectInternalServerError(service.getAccountByUserId('u1'));
    prisma.profile.upsert.mockRejectedValue(error);
    await expectInternalServerError(service.getOrCreateAccountByUserId('u1'));
  });
});
