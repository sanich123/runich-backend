import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { asyncMock } from 'src/tests/helpers';
import { MAX_ACTIVITY_HEART_RATE_SAMPLES } from 'src/common/constants';

const readFile = asyncMock();
const importFromFit = asyncMock();
const importFromGPX = asyncMock();
const importFromTCX = asyncMock();

jest.unstable_mockModule('node:fs/promises', () => ({ readFile }));
jest.unstable_mockModule('@ardentcode/sports-lib', () => ({
  SportsLib: { importFromFit, importFromGPX, importFromTCX },
}));

const { getHeartRateFromFile } = await import('../get-heart-rate-from-file');

function createStream(samples: Array<{ time: number; value: number | null }>) {
  return {
    type: 'Heart Rate',
    getStreamDataByTime: jest.fn(() => samples),
  };
}

function createEvent(activities: Array<{ startDate: Date; getAllStreams: () => unknown[] }>) {
  return { getActivities: () => activities };
}

describe('getHeartRateFromFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no samples for unsupported file types without reading them', async () => {
    await expect(getHeartRateFromFile('activities/run.json', '/tmp/migration')).resolves.toEqual({ samples: [] });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('parses FIT heart-rate streams, filters invalid samples, sorts them, and derives statistics', async () => {
    const stream = createStream([
      { time: 30_000, value: 140.4 },
      { time: 10_000, value: 100 },
      { time: 20_000, value: 0 },
      { time: -1, value: 120 },
      { time: Number.NaN, value: 120 },
      { time: Number.POSITIVE_INFINITY, value: 120 },
      { time: 40_000, value: 301 },
      { time: 50_000, value: null },
    ]);
    const event = createEvent([
      { startDate: new Date(0), getAllStreams: () => [{ type: 'Cadence' }, stream] },
      { startDate: new Date(0), getAllStreams: () => [{ type: 'Cadence' }] },
    ]);
    readFile.mockResolvedValue(Buffer.from([1, 2, 3]));
    importFromFit.mockResolvedValue(event);

    await expect(getHeartRateFromFile('activities/run.FIT', '/tmp/migration')).resolves.toEqual({
      samples: [
        { timestamp: 10_000, beatsPerMinute: 100 },
        { timestamp: 30_000, beatsPerMinute: 140 },
      ],
      statistics: { averageHeartRate: 120, minHeartRate: 100, maxHeartRate: 140 },
    });
    expect(readFile).toHaveBeenCalledWith('/tmp/migration/activities/run.FIT');
    expect(importFromFit).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    expect(stream.getStreamDataByTime).toHaveBeenCalledWith(new Date(0), true);
  });

  it('passes GPX and TCX content through their matching sports parsers', async () => {
    readFile.mockResolvedValueOnce('<gpx/>').mockResolvedValueOnce('<TrainingCenterDatabase/>');
    importFromGPX.mockResolvedValue(createEvent([]));
    importFromTCX.mockResolvedValue(createEvent([]));

    await expect(getHeartRateFromFile('activities/run.gpx', '/tmp/migration')).resolves.toEqual({ samples: [] });
    await expect(getHeartRateFromFile('activities/run.tcx', '/tmp/migration')).resolves.toEqual({ samples: [] });

    expect(readFile).toHaveBeenNthCalledWith(1, '/tmp/migration/activities/run.gpx', { encoding: 'utf-8' });
    expect(importFromGPX).toHaveBeenCalledWith('<gpx/>', expect.any(Function));
    const [, parseGpxXml] = importFromGPX.mock.calls[0] as unknown as [string, (xml: string) => unknown];
    expect(parseGpxXml('<gpx/>')).toBeDefined();
    expect(readFile).toHaveBeenNthCalledWith(2, '/tmp/migration/activities/run.tcx', { encoding: 'utf-8' });
    expect(importFromTCX).toHaveBeenCalledWith(expect.any(Object));
  });

  it('returns empty results for activities with no heart-rate measurements', async () => {
    readFile.mockResolvedValue(Buffer.from([1]));
    importFromFit.mockResolvedValue(
      createEvent([
        { startDate: new Date(0), getAllStreams: () => [{ type: 'Cadence' }] },
        { startDate: new Date(0), getAllStreams: () => [createStream([])] },
      ]),
    );

    await expect(getHeartRateFromFile('activities/no-heart-rate.fit', '/tmp/migration')).resolves.toEqual({
      samples: [],
    });
  });

  it('limits large heart-rate streams while preserving the first and last measurements', async () => {
    const samples = Array.from({ length: MAX_ACTIVITY_HEART_RATE_SAMPLES + 1 }, (_, time) => ({
      time,
      value: 100 + (time % 80),
    }));
    readFile.mockResolvedValue(Buffer.from([1]));
    importFromFit.mockResolvedValue(
      createEvent([{ startDate: new Date(0), getAllStreams: () => [createStream(samples)] }]),
    );

    const result = await getHeartRateFromFile('activities/large.fit', '/tmp/migration');

    expect(result.samples).toHaveLength(MAX_ACTIVITY_HEART_RATE_SAMPLES);
    expect(result.samples[0]).toEqual({ timestamp: 0, beatsPerMinute: 100 });
    expect(result.samples.at(-1)).toEqual({
      timestamp: MAX_ACTIVITY_HEART_RATE_SAMPLES,
      beatsPerMinute: 100 + (MAX_ACTIVITY_HEART_RATE_SAMPLES % 80),
    });
    expect(result.statistics).toEqual({
      averageHeartRate: expect.any(Number),
      minHeartRate: 100,
      maxHeartRate: 179,
    });
  });

  it('returns an empty result and logs parser failures without exposing raw errors', async () => {
    readFile.mockRejectedValueOnce(new Error('file unavailable'));
    const loggerWarning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(getHeartRateFromFile('activities/missing.fit', '/tmp/migration')).resolves.toEqual({ samples: [] });

    readFile.mockResolvedValue(Buffer.from([1]));
    importFromFit.mockRejectedValueOnce('decoder failed');
    await expect(getHeartRateFromFile('activities/corrupt.fit', '/tmp/migration')).resolves.toEqual({ samples: [] });
    expect(loggerWarning).toHaveBeenCalledTimes(2);
    loggerWarning.mockRestore();
  });
});
