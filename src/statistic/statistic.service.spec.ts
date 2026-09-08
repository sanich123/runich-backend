import { StatisticService } from './statistic.service';
import { asyncMock, expectInternalServerError } from 'src/__tests__/helpers';

function createPrismaMock() {
  return { activity: { findMany: asyncMock() } };
}

const activities = [
  { duration: 100, distance: 1000, speed: 5, date: new Date('2025-01-02'), id: 'a1', sport: 'run' },
  { duration: 200, distance: 2000, speed: 6, date: new Date('2025-01-03'), id: 'a2', sport: 'bike' },
];

describe('StatisticService', () => {
  it('returns years and unique sports for activity history', async () => {
    const prisma = createPrismaMock();
    const service = new StatisticService(prisma as never);
    prisma.activity.findMany.mockResolvedValueOnce([
      { date: new Date('2025-01-02') },
      { date: new Date('2025-06-02') },
    ]);
    prisma.activity.findMany.mockResolvedValueOnce([{ sport: 'run' }, { sport: 'run' }, { sport: 'bike' }]);

    await expect(service.getYearsAndTypesOfActivities('u1')).resolves.toEqual([{ year: 2025, types: ['run', 'bike'] }]);
    expect(prisma.activity.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
    );
  });

  it('calculates monthly statistics grouped by sport', async () => {
    const prisma = createPrismaMock();
    const service = new StatisticService(prisma as never);
    prisma.activity.findMany.mockResolvedValue(activities);

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
  });

  it('returns category activities, yearly summaries and empty-state summaries', async () => {
    const prisma = createPrismaMock();
    const service = new StatisticService(prisma as never);
    prisma.activity.findMany.mockResolvedValueOnce([{ duration: 100, distance: 1000, speed: 5 }]);
    await expect(service.getActivitiesByYearMonthCategory('u1', '2025', '0', 'run')).resolves.toEqual([
      { duration: 100, distance: 1000, speed: 5 },
    ]);

    prisma.activity.findMany.mockResolvedValueOnce(activities);
    await expect(service.getStatisticByYearAndCategory('u1')).resolves.toMatchObject({ isUserHasActivities: true });

    prisma.activity.findMany.mockResolvedValueOnce([]);
    await expect(service.getStatisticByYearAndCategory('u1')).resolves.toEqual({ isUserHasActivities: false });
  });

  it('calculates weekly and all-time metrics, including empty input', async () => {
    const prisma = createPrismaMock();
    const service = new StatisticService(prisma as never);
    prisma.activity.findMany.mockResolvedValue(activities);

    await expect(service.getCurrentWeekStatistics('u1', 'Mon Aug 10 2026', 'Sun Aug 16 2026')).resolves.toEqual({
      totalDuration: 300,
      totalDistance: 3000,
      totalItems: 2,
    });
    expect(prisma.activity.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
    );
    await expect(service.getAllActivitiesStatisticsByUserId('u1')).resolves.toEqual({
      totalDuration: 300,
      totalDistance: 3000,
      totalItems: 2,
    });
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
    const service = new StatisticService(prisma as never);

    await expectInternalServerError(service.getYearsAndTypesOfActivities('u1'));
    await expectInternalServerError(service.getMonthStatisticsByYearMonth('u1', '2025', '0'));
    await expectInternalServerError(service.getActivitiesByYearMonthCategory('u1', '2025', '0', 'run'));
    await expectInternalServerError(service.getStatisticByYearAndCategory('u1'));
    await expectInternalServerError(service.getCurrentWeekStatistics('u1', 'Mon Aug 10 2026', 'Sun Aug 16 2026'));
    await expectInternalServerError(service.getAllActivitiesStatisticsByUserId('u1'));
  });
});
