import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { StatisticController } from '../statistic.controller';
import { StatisticService } from '../statistic.service';
import { asyncMock } from 'src/tests/helpers';

describe('StatisticController', () => {
  const service = {
    getStatisticByYearAndCategory: asyncMock(),
    getMonthStatisticsByYearMonth: asyncMock(),
    getCurrentWeekStatistics: asyncMock(),
    getAllActivitiesStatisticsByUserId: asyncMock(),
  };
  const controller = new StatisticController(service as unknown as StatisticService);

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for every statistics endpoint', async () => {
    const result = { totalItems: 2 };
    service.getStatisticByYearAndCategory.mockResolvedValue(result);
    service.getMonthStatisticsByYearMonth.mockResolvedValue(result);
    service.getCurrentWeekStatistics.mockResolvedValue(result);
    service.getAllActivitiesStatisticsByUserId.mockResolvedValue(result);

    await expect(controller.getYearStatisticByYearAndCategory({ id: 'u1' })).resolves.toEqual(result);
    await expect(controller.getMonthStatistics({ id: 'u1' }, '2025', '0')).resolves.toEqual(result);
    await expect(
      controller.getCurrentWeekStatistics({ id: 'u1' }, 'Mon Aug 10 2026', 'Sun Aug 16 2026'),
    ).resolves.toEqual(result);
    await expect(controller.getAllTimeStatistics({ id: 'u1' })).resolves.toEqual(result);
    expect(service.getMonthStatisticsByYearMonth).toHaveBeenCalledWith('u1', '2025', '0');
  });

  it('propagates service errors from every statistics endpoint', async () => {
    const error = new Error('service failed');
    Object.values(service).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.getYearStatisticByYearAndCategory({ id: 'u1' })).rejects.toBe(error);
    await expect(controller.getMonthStatistics({ id: 'u1' }, '2025', '0')).rejects.toBe(error);
    await expect(controller.getCurrentWeekStatistics({ id: 'u1' }, '2026-08-10', '2026-08-16')).rejects.toBe(error);
    await expect(controller.getAllTimeStatistics({ id: 'u1' })).rejects.toBe(error);
  });

  it('rejects malformed month and week date queries before calling the service', async () => {
    await expect(controller.getMonthStatistics({ id: 'u1' }, '2025', '12')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getCurrentWeekStatistics({ id: 'u1' }, 'not-a-date', '2026-08-16')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.getMonthStatisticsByYearMonth).not.toHaveBeenCalled();
    expect(service.getCurrentWeekStatistics).not.toHaveBeenCalled();
  });
});
