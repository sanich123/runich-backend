import { LatencyMetricsService } from '../latency-metrics.service';
import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';

describe('LatencyMetricsService', () => {
  it('calculates endpoint percentiles from bounded samples', () => {
    const service = new LatencyMetricsService();

    for (let durationMs = 1; durationMs <= 100; durationMs += 1) {
      service.observeHttp('GET /activities', durationMs);
    }

    expect(service.getSnapshot('http', 'GET /activities')).toEqual({
      category: 'http',
      name: 'GET /activities',
      count: 100,
      p50: 50,
      p95: 95,
      p99: 99,
    });
    service.onModuleDestroy();
  });

  it('keeps separate metrics for database and external calls', () => {
    const service = new LatencyMetricsService();

    service.observeDatabase('Activity.findMany', 12);
    service.observeExternal('s3', 'putObject', 34);

    expect(service.getSnapshots()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'db', name: 'Activity.findMany', p50: 12 }),
        expect.objectContaining({ category: 'external', name: 's3.putObject', p50: 34 }),
      ]),
    );
    service.onModuleDestroy();
  });

  it('ignores invalid durations and returns null for an unknown metric', () => {
    const service = new LatencyMetricsService();

    service.observeHttp('GET /invalid', Number.NaN);
    service.observeHttp('GET /invalid', -1);

    expect(service.getSnapshot('http', 'GET /invalid')).toBeNull();
    service.onModuleDestroy();
  });

  it('keeps only the most recent thousand samples', () => {
    const service = new LatencyMetricsService();

    for (let durationMs = 0; durationMs <= 1_000; durationMs += 1) {
      service.observe('db', 'bounded', durationMs);
    }

    expect(service.getSnapshot('db', 'bounded')).toMatchObject({ count: 1_000, p50: 500, p95: 950, p99: 990 });
    service.onModuleDestroy();
  });

  it('logs a report only when metrics exist', () => {
    const service = new LatencyMetricsService();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    service['logReport']();
    expect(log).not.toHaveBeenCalled();

    service.observeHttp('GET /health', 320);
    service['logReport']();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('http.GET /health count=1'));

    service.onModuleDestroy();
  });
});
