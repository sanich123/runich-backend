import { StatisticService } from './statistic.service';
import { asyncMock, expectInternalServerError } from 'src/__tests__/helpers';

function createPrismaMock() {
  return { activity: { findMany: asyncMock() }, $queryRaw: asyncMock() };
}

const activities = [
  { duration: 100, distance: 1000, speed: 5, date: new Date('2025-01-02'), id: 'a1', sport: 'run' },
  { duration: 200, distance: 2000, speed: 6, date: new Date('2025-01-03'), id: 'a2', sport: 'bike' },
];

function getQueryText(call: unknown[]) {
  return (call[0] as TemplateStringsArray).join('$parameter');
}

function getQueryParameter(call: unknown[]) {
  return call[1];
}

describe('StatisticService', () => {
  it('returns years and unique sports for activity history', async () => {
    const prisma = createPrismaMock();
    const service = new StatisticService(prisma as never);
    prisma.$queryRaw.mockResolvedValueOnce([
      { year: 2025, sport: 'bike' },
      { year: 2025, sport: 'run' },
      { year: 2026, sport: 'run' },
    ]);

    await expect(service.getYearsAndTypesOfActivities('u1')).resolves.toEqual([
      { year: 2025, types: ['bike', 'run'] },
      { year: 2026, types: ['run'] },
    ]);
    expect(getQueryText(prisma.$queryRaw.mock.calls[0])).toContain('GROUP BY 1, "sport"');
    expect(getQueryParameter(prisma.$queryRaw.mock.calls[0])).toBe('u1');
  });

  it('calculates monthly statistics grouped by sport', async () => {
    const prisma = createPrismaMock();
    const service = new StatisticService(prisma as never);
    prisma.activity.findMany.mockResolvedValue(activities);
    prisma.$queryRaw.mockResolvedValue([
      { sport: null, totalDuration: 300, totalDistance: 3000, totalItems: 2 },
      { sport: 'bike', totalDuration: 200, totalDistance: 2000, totalItems: 1 },
      { sport: 'run', totalDuration: 100, totalDistance: 1000, totalItems: 1 },
    ]);

    await expect(service.getMonthStatisticsByYearMonth('u1', '2025', '0')).resolves.toEqual({
      activities,
      activitiesReducedBySport: {
        all: { totalDuration: 300, totalDistance: 3000, totalItems: 2 },
        run: { totalDuration: 100, totalDistance: 1000, totalItems: 1 },
        bike: { totalDuration: 200, totalDistance: 2000, totalItems: 1 },
      },
    });
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
    );
    expect(getQueryText(prisma.$queryRaw.mock.calls[0])).toMatch(/SUM\("duration"\).*COUNT\(\*\).*GROUP BY ROLLUP/s);
    expect(getQueryParameter(prisma.$queryRaw.mock.calls[0])).toBe('u1');
  });

  it('returns category activities, yearly summaries and empty-state summaries', async () => {
    const prisma = createPrismaMock();
    const service = new StatisticService(prisma as never);
    prisma.activity.findMany.mockResolvedValueOnce([{ duration: 100, distance: 1000, speed: 5 }]);
    await expect(service.getActivitiesByYearMonthCategory('u1', '2025', '0', 'run')).resolves.toEqual([
      { duration: 100, distance: 1000, speed: 5 },
    ]);

    prisma.$queryRaw.mockResolvedValueOnce([
      {
        year: 2025,
        month: 0,
        sport: 'run',
        totalDuration: 1,
        totalDistance: 2,
        totalItems: 1,
      },
      {
        year: 2025,
        month: 0,
        sport: 'bike',
        totalDuration: 2,
        totalDistance: 3,
        totalItems: 1,
      },
    ]);
    await expect(service.getStatisticByYearAndCategory('u1')).resolves.toEqual({
      isUserHasActivities: true,
      '2025': {
        all: {
          0: { totalDuration: 3, totalDistance: 5, totalItems: 2 },
          totalDuration: 3,
          totalDistance: 5,
          totalItems: 2,
        },
        run: {
          0: { totalDuration: 1, totalDistance: 2, totalItems: 1 },
          totalDuration: 1,
          totalDistance: 2,
          totalItems: 1,
        },
        bike: {
          0: { totalDuration: 2, totalDistance: 3, totalItems: 1 },
          totalDuration: 2,
          totalDistance: 3,
          totalItems: 1,
        },
      },
    });
    expect(getQueryText(prisma.$queryRaw.mock.calls[0])).toMatch(
      /EXTRACT\(YEAR.*SUM\("duration"\).*SUM\("distance"\).*COUNT\(\*\).*GROUP BY 1, 2/s,
    );
    expect(getQueryParameter(prisma.$queryRaw.mock.calls[0])).toBe('u1');

    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.getStatisticByYearAndCategory('u1')).resolves.toEqual({ isUserHasActivities: false });
  });

  it('calculates weekly and all-time metrics, including empty input', async () => {
    const prisma = createPrismaMock();
    const service = new StatisticService(prisma as never);
    prisma.$queryRaw.mockResolvedValue([{ totalDuration: 300, totalDistance: 3000, totalItems: 2 }]);

    await expect(service.getCurrentWeekStatistics('u1', 'Mon Aug 10 2026', 'Sun Aug 16 2026')).resolves.toEqual({
      totalDuration: 300,
      totalDistance: 3000,
      totalItems: 2,
    });
    await expect(service.getAllActivitiesStatisticsByUserId('u1')).resolves.toEqual({
      totalDuration: 300,
      totalDistance: 3000,
      totalItems: 2,
    });
    expect(getQueryText(prisma.$queryRaw.mock.calls[1])).toMatch(/SUM\("duration"\).*SUM\("distance"\).*COUNT\(\*\)/s);
    expect(service.reduceMetricsFromActivities(undefined as never)).toEqual({
      totalDistance: 0,
      totalDuration: 0,
      totalItems: 0,
    });
  });

  it('converts database failures from every database-backed method to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
    prisma.activity.findMany.mockRejectedValue(error);
    prisma.$queryRaw.mockRejectedValue(error);
    const service = new StatisticService(prisma as never);

    await expectInternalServerError(service.getYearsAndTypesOfActivities('u1'));
    await expectInternalServerError(service.getMonthStatisticsByYearMonth('u1', '2025', '0'));
    await expectInternalServerError(service.getActivitiesByYearMonthCategory('u1', '2025', '0', 'run'));
    await expectInternalServerError(service.getStatisticByYearAndCategory('u1'));
    await expectInternalServerError(service.getCurrentWeekStatistics('u1', 'Mon Aug 10 2026', 'Sun Aug 16 2026'));
    await expectInternalServerError(service.getAllActivitiesStatisticsByUserId('u1'));
  });
});
