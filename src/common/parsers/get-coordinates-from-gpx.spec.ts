import { jest } from '@jest/globals';

const readFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseGPXWithCustomParser = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('fs/promises', () => ({ readFile }));
jest.unstable_mockModule('@we-gold/gpxjs', () => ({ parseGPXWithCustomParser }));

const { getCoordinatesFromGpxFile } = await import('./get-coordinates-from-gpx');

describe('getCoordinatesFromGpxFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readFile.mockResolvedValue('<gpx />');
    parseGPXWithCustomParser.mockResolvedValue([
      {
        tracks: [
          {
            points: [
              {
                longitude: 37.61,
                latitude: 55.75,
                elevation: 150,
                time: new Date('2026-08-22T10:00:00.000Z'),
              },
              { longitude: 37.62, latitude: 55.76, time: '2026-08-22T10:01:00.000Z' },
              { longitude: Number.NaN, latitude: 55.77 },
              { longitude: 37.63, latitude: 55.77, time: 'invalid' },
            ],
          },
        ],
      },
    ]);
  });

  it('maps valid GPX points, timestamps and optional elevation', async () => {
    await expect(getCoordinatesFromGpxFile('/tmp/activity.gpx')).resolves.toEqual([
      {
        coords: {
          longitude: 37.61,
          latitude: 55.75,
          altitude: 150,
          timestamp: new Date('2026-08-22T10:00:00.000Z').getTime(),
        },
      },
      {
        coords: {
          longitude: 37.62,
          latitude: 55.76,
          timestamp: new Date('2026-08-22T10:01:00.000Z').getTime(),
        },
      },
      { coords: { longitude: 37.63, latitude: 55.77 } },
    ]);
    expect(readFile).toHaveBeenCalledWith('/tmp/activity.gpx', { encoding: 'utf-8' });
  });

  it('rethrows malformed file errors', async () => {
    const error = new Error('invalid GPX');
    readFile.mockRejectedValue(error);

    await expect(getCoordinatesFromGpxFile('/tmp/activity.gpx')).rejects.toBe(error);
  });
});
