import { asyncMock, expectInternalServerError } from 'src/tests/helpers';
import type { ActivityCursor } from '../activity.pagination';
import { ActivityReadService } from '../services/activity-read.service';

function createPrismaMock() {
  return {
    $queryRaw: asyncMock(),
    activity: { findMany: asyncMock() },
  };
}

function makeActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'activity-1',
    date: new Date('2026-10-01T10:00:00.000Z'),
    userId: 'user-1',
    title: 'Morning run',
    sport: 'run',
    media: [],
    hideMap: false,
    elevationGain: 12,
    ...overrides,
  };
}

describe('ActivityReadService route list', () => {
  it('returns distinct sorted date filters and an empty first page without optional filters', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityReadService(prisma as never, {} as never, {} as never);
    prisma.$queryRaw.mockResolvedValue([
      { year: 2023, month: 2, day: 4 },
      { year: 2024, month: 1, day: 3 },
      { year: 2024, month: 2, day: 3 },
      { year: 2023, month: 2, day: 4 },
    ]);
    prisma.activity.findMany.mockResolvedValue([]);

    await expect(service.getActivitiesWithRoutes('user-1', undefined, undefined, { timeZone: 'UTC' })).resolves.toEqual(
      {
        activities: [],
        hasMore: false,
        nextCursor: null,
        isLastPage: true,
        availableFilters: { years: [2024, 2023], months: [1, 2], days: [3, 4] },
      },
    );

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', AND: [] }),
        take: 21,
      }),
    );
  });

  it('applies search, local date and cursor filters and returns a next page cursor', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityReadService(prisma as never, {} as never, {} as never);
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { year: 2024, month: 5, day: 2 },
        { year: 2024, month: 4, day: 2 },
        { year: 2023, month: 5, day: 2 },
        { year: 2024, month: 5, day: 1 },
        { year: 2024, month: 5, day: 2 },
      ])
      .mockResolvedValueOnce([{ id: 'activity-1' }, { id: 'activity-2' }]);
    const activityDate = new Date('2026-10-02T10:00:00.000Z');
    prisma.activity.findMany.mockResolvedValue([
      makeActivity({ id: 'activity-1', date: activityDate }),
      makeActivity({ id: 'activity-2', date: new Date('2026-10-01T10:00:00.000Z') }),
    ]);
    const cursor: ActivityCursor = { date: new Date('2026-09-30T10:00:00.000Z'), id: 'cursor-id' };

    const result = await service.getActivitiesWithRoutes('user-1', '1', cursor, {
      search: 'run',
      year: 2024,
      month: 5,
      day: 2,
      timeZone: 'Europe/Moscow',
    });

    expect(result).toMatchObject({
      activities: [{ id: 'activity-1', elevationGain: 12 }],
      hasMore: true,
      isLastPage: false,
      availableFilters: { years: [2024, 2023], months: [4, 5], days: [1, 2] },
    });
    expect(result?.nextCursor).toBe(
      Buffer.from(JSON.stringify({ date: activityDate.toISOString(), id: 'activity-1' })).toString('base64url'),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          AND: [
            {
              OR: [
                { title: { contains: 'run', mode: 'insensitive' } },
                { sport: { contains: 'run', mode: 'insensitive' } },
              ],
            },
            { id: { in: ['activity-1', 'activity-2'] } },
            {
              OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
            },
          ],
        }),
        take: 2,
      }),
    );
  });

  it('filters by one local date component and keeps the remaining filter options available', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityReadService(prisma as never, {} as never, {} as never);
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { year: 2024, month: 5, day: 1 },
        { year: 2025, month: 5, day: 2 },
        { year: 2025, month: 6, day: 3 },
      ])
      .mockResolvedValueOnce([{ id: 'activity-1' }]);
    prisma.activity.findMany.mockResolvedValue([]);

    const result = await service.getActivitiesWithRoutes('user-1', '10', undefined, {
      month: 5,
      timeZone: 'UTC',
    });

    expect(result).toMatchObject({
      activities: [],
      hasMore: false,
      availableFilters: { years: [2025, 2024], months: [5, 6], days: [1, 2] },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: [{ id: { in: ['activity-1'] } }] }) }),
    );
  });

  it('maps an empty page after a zero-sized slice to a null cursor even when more rows exist', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityReadService(prisma as never, {} as never, {} as never);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.activity.findMany.mockResolvedValue([makeActivity()]);

    await expect(service.getActivitiesWithRoutes('user-1', '0', undefined, { timeZone: 'UTC' })).resolves.toMatchObject(
      {
        activities: [],
        hasMore: true,
        nextCursor: null,
        isLastPage: false,
      },
    );
  });

  it('maps query failures to the standard internal server error', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityReadService(prisma as never, {} as never, {} as never);
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));

    await expectInternalServerError(service.getActivitiesWithRoutes('user-1', '10', undefined, { timeZone: 'UTC' }));
  });
});
