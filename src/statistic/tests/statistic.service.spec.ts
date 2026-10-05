import { ForbiddenException } from '@nestjs/common';
import { StatisticService } from '../statistic.service';
import { asyncMock, expectInternalServerError } from 'src/tests/helpers';
import { DEFAULT_TIME_ZONE } from 'src/common/utils/time-zone';

function createPrismaMock() {
  return { activity: { findMany: asyncMock() }, profile: { findUnique: asyncMock() }, $queryRaw: asyncMock() };
}

const activities = [
  { duration: 100, distance: 1000, speed: 5, date: new Date('2025-01-02'), id: 'a1', sport: 'run' },
  { duration: 200, distance: 2000, speed: 6, date: new Date('2025-01-03'), id: 'a2', sport: 'bike' },
];

function getQueryText(call: unknown[]) {
  return (call[0] as TemplateStringsArray).join('$parameter');
}

function getQueryParameters(call: unknown[]) {
  return call.slice(1);
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
    expect(getQueryParameters(prisma.$queryRaw.mock.calls[0])).toEqual(
      expect.arrayContaining(['u1', DEFAULT_TIME_ZONE]),
    );
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
    expect(getQueryParameters(prisma.$queryRaw.mock.calls[0])).toContain('u1');
  });

  it('returns category activities, yearly summaries and empty-state summaries', async () => {
    const prisma = createPrismaMock();
    const service = new StatisticService(prisma as never);
    prisma.activity.findMany.mockResolvedValueOnce([{ duration: 100, distance: 1000, speed: 5 }]);
    await expect(service.getActivitiesByYearMonthCategory('u1', '2025', '0', 'run')).resolves.toEqual([
      { duration: 100, distance: 1000, speed: 5 },
    ]);
    prisma.activity.findMany.mockResolvedValueOnce([
      {
        duration: 100,
        distance: 1000,
        steps: 2,
        caloriesActive: 5,
        date: new Date('2025-01-02T12:00:00.000Z'),
        sport: 'run',
      },
      {
        duration: 200,
        distance: 2000,
        steps: 4,
        caloriesActive: 20,
        date: new Date('2025-01-02T15:00:00.000Z'),
        sport: 'bike',
      },
    ]);

    prisma.$queryRaw.mockResolvedValueOnce([
      {
        year: 2025,
        month: 0,
        sport: 'run',
        totalDuration: 1,
        totalDistance: 2,
        totalItems: 1,
        totalSteps: 2,
        totalCaloriesActive: 5,
      },
      {
        year: 2025,
        month: 0,
        sport: 'bike',
        totalDuration: 2,
        totalDistance: 3,
        totalItems: 1,
        totalSteps: 4,
        totalCaloriesActive: 20,
      },
    ]);
    await expect(service.getStatisticByYearAndCategory('u1', 'UTC')).resolves.toEqual({
      isUserHasActivities: true,
      '2025': {
        all: {
          0: {
            totalDuration: 3,
            totalDistance: 5,
            totalItems: 2,
            totalSteps: 6,
            totalCaloriesActive: 25,
          },
          totalDuration: 3,
          totalDistance: 5,
          totalItems: 2,
          totalSteps: 6,
          totalCaloriesActive: 25,
        },
        run: {
          0: {
            totalDuration: 1,
            totalDistance: 2,
            totalItems: 1,
            totalSteps: 2,
            totalCaloriesActive: 5,
          },
          totalDuration: 1,
          totalDistance: 2,
          totalItems: 1,
          totalSteps: 2,
          totalCaloriesActive: 5,
        },
        bike: {
          0: {
            totalDuration: 2,
            totalDistance: 3,
            totalItems: 1,
            totalSteps: 4,
            totalCaloriesActive: 20,
          },
          totalDuration: 2,
          totalDistance: 3,
          totalItems: 1,
          totalSteps: 4,
          totalCaloriesActive: 20,
        },
        dailyActivities: {
          '2025-01-02': [
            {
              duration: 100,
              distance: 1000,
              steps: 2,
              caloriesActive: 5,
              date: '2025-01-02T12:00:00.000Z',
              sport: 'run',
            },
            {
              duration: 200,
              distance: 2000,
              steps: 4,
              caloriesActive: 20,
              date: '2025-01-02T15:00:00.000Z',
              sport: 'bike',
            },
          ],
        },
      },
    });
    expect(getQueryText(prisma.$queryRaw.mock.calls[0])).toMatch(
      /EXTRACT\(YEAR.*AT TIME ZONE.*SUM\("duration"\).*SUM\("distance"\).*COUNT\(\*\).*GROUP BY 1, 2/s,
    );
    expect(getQueryParameters(prisma.$queryRaw.mock.calls[0])).toEqual(expect.arrayContaining(['u1', 'UTC']));

    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.getStatisticByYearAndCategory('u1', 'UTC')).resolves.toEqual({ isUserHasActivities: false });
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

  it('hides total statistics from other users and keeps them visible to the owner', async () => {
    const prisma = createPrismaMock();
    const service = new StatisticService(prisma as never);
    prisma.profile.findUnique.mockResolvedValue({ hideActivityStatistics: true });
    prisma.$queryRaw.mockResolvedValue([{ totalDuration: 0, totalDistance: 0, totalItems: 0 }]);

    await expect(service.getAllActivitiesStatisticsByUserId('owner-1', 'viewer-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();

    await expect(service.getAllActivitiesStatisticsByUserId('owner-1', 'owner-1')).resolves.toEqual({
      totalDuration: 0,
      totalDistance: 0,
      totalItems: 0,
    });
    expect(prisma.profile.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
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
