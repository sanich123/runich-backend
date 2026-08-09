import { jest } from '@jest/globals';
import { StatisticController } from './statistic.controller';
import { StatisticService } from './statistic.service';
import { asyncMock } from 'src/__tests__/helpers';

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
    await expect(controller.getMonthStatistics('2025', '0', { id: 'u1' })).resolves.toEqual(result);
    await expect(
      controller.getCurrentWeekStatistics('Mon Aug 10 2026', 'Sun Aug 16 2026', { id: 'u1' }),
    ).resolves.toEqual(result);
    await expect(controller.getAllTimeStatistics({ id: 'u1' })).resolves.toEqual(result);
    expect(service.getMonthStatisticsByYearMonth).toHaveBeenCalledWith('u1', '2025', '0');
  });

  it('propagates service errors from every statistics endpoint', async () => {
    const error = new Error('service failed');
    Object.values(service).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.getYearStatisticByYearAndCategory({ id: 'u1' })).rejects.toBe(error);
    await expect(controller.getMonthStatistics('2025', '0', { id: 'u1' })).rejects.toBe(error);
    await expect(controller.getCurrentWeekStatistics('first', 'last', { id: 'u1' })).rejects.toBe(error);
    await expect(controller.getAllTimeStatistics({ id: 'u1' })).rejects.toBe(error);
  });
});
