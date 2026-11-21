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
  });

  it('ignores invalid durations and returns null for an unknown metric', () => {
    const service = new LatencyMetricsService();

    service.observeHttp('GET /invalid', Number.NaN);
    service.observeHttp('GET /invalid', -1);

    expect(service.getSnapshot('http', 'GET /invalid')).toBeNull();
  });

  it('exports HTTP request metrics only for valid status codes', async () => {
    const service = new LatencyMetricsService();

    service.observeHttp('POST /moderation', 42, 201);
    service.observeHttp('/unmatched', 18, 500);
    service.observeHttp('GET /undefined-status', 12);
    service.observeHttp('GET /fractional-status', 12, 200.5);
    service.observeHttp('GET /low-status', 12, 99);
    service.observeHttp('GET /high-status', 12, 600);

    const metrics = await service.getPrometheusMetrics();

    expect(metrics).toContain('runich_http_requests_total{method="POST",route="/moderation",status_class="2xx"} 1');
    expect(metrics).toContain(
      'runich_http_request_duration_seconds_count{method="POST",route="/moderation",status_class="2xx"} 1',
    );
    expect(metrics).toContain('runich_http_requests_total{method="UNKNOWN",route="/unmatched",status_class="5xx"} 1');
    expect(metrics).not.toContain('fractional-status');
    expect(metrics).not.toContain('low-status');
    expect(metrics).not.toContain('high-status');
  });

  it('keeps only the most recent thousand samples', () => {
    const service = new LatencyMetricsService();

    for (let durationMs = 0; durationMs <= 1_000; durationMs += 1) {
      service.observe('db', 'bounded', durationMs);
    }

    expect(service.getSnapshot('db', 'bounded')).toMatchObject({ count: 1_000, p50: 500, p95: 950, p99: 990 });
  });

  it('does not emit periodic latency reports', () => {
    jest.useFakeTimers();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    try {
      const service = new LatencyMetricsService();
      service.observeHttp('GET /health', 320);
      jest.advanceTimersByTime(10 * 60 * 1_000);

      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      jest.useRealTimers();
    }
  });
});
