import { formatOperationalMetricsText, getOperationalMetricRows, type OperationalMetrics } from './operational-metrics';

const metrics: OperationalMetrics = {
  capturedAt: '2026-10-13T06:00:00.000Z',
  users: { total: 12481, new24h: 23, active24h: 614, active7d: 2180 },
  content: { profiles: 12470, activities: 45210, activities24h: 87, comments24h: 31, likes24h: 142, follows24h: 18 },
  queues: {
    mediaQueued: 4,
    enrichmentQueued: 0,
    importsQueued: 1,
    importsProcessing: 0,
    emailsQueued: 2,
    emailsProcessing: 1,
    failedJobs24h: 0,
  },
  database: { sizeBytes: 1.8 * 1024 ** 3, connections: 14, maxConnections: 100 },
};

describe('operational metrics formatting', () => {
  it('renders an aggregate snapshot without personal data', () => {
    const rows = getOperationalMetricRows(metrics);
    const text = formatOperationalMetricsText(metrics);

    expect(rows).toEqual(
      expect.arrayContaining([
        { label: 'Users', value: '12 481 total, +23/24h' },
        { label: 'Database', value: '1.8 GB, 14/100 connections' },
      ]),
    );
    expect(text).toContain('Active users: 614/24h, 2 180/7d');
    expect(text).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f-]{27}/i);
  });
});
