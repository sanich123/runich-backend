import { jest } from '@jest/globals';
import { DOMParser } from 'xmldom-qsa';
import { Logger } from '@nestjs/common';

const readFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseGPXWithCustomParser = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const importFromGPX = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('fs/promises', () => ({ readFile }));
jest.unstable_mockModule('@we-gold/gpxjs', () => ({ parseGPXWithCustomParser }));
jest.unstable_mockModule('@ardentcode/sports-lib', () => ({ SportsLib: { importFromGPX } }));

const { getCoordinatesFromGpxFile } = await import('../get-coordinates-from-gpx');

describe('getCoordinatesFromGpxFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readFile.mockResolvedValue('<gpx />');
    importFromGPX.mockResolvedValue({ getActivities: () => [] });
    parseGPXWithCustomParser.mockResolvedValue([
      {
        xml: new DOMParser().parseFromString('<gpx />', 'text/xml'),
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
    expect(importFromGPX).toHaveBeenCalledWith('<gpx />', expect.any(Function));
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('reuses the GPX document parsed for route points when extracting heart-rate data', async () => {
    const document = new DOMParser().parseFromString('<gpx />', 'text/xml');
    parseGPXWithCustomParser.mockResolvedValueOnce([{ xml: document, tracks: [] }, null]);
    let reusedDocument: Document | undefined;
    importFromGPX.mockImplementationOnce(async (_source, parserConstructor) => {
      if (typeof parserConstructor !== 'function') throw new Error('Missing parser constructor');
      const ParserConstructor = parserConstructor as new () => { parseFromString: () => Document };
      reusedDocument = new ParserConstructor().parseFromString();
      return { getActivities: () => [] };
    });

    await expect(getCoordinatesFromGpxFile('/tmp/activity.gpx')).resolves.toEqual([]);

    expect(reusedDocument).toBe(document);
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('preserves route coordinates when the optional heart-rate import fails', async () => {
    const loggerWarning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    importFromGPX.mockRejectedValueOnce('heart-rate parser unavailable');

    await expect(getCoordinatesFromGpxFile('/tmp/activity.gpx')).resolves.toHaveLength(3);
    expect(loggerWarning).toHaveBeenCalledWith(expect.stringContaining('heart-rate parser unavailable'));

    loggerWarning.mockRestore();
  });

  it('rejects malformed GPX parse results', async () => {
    const error = new Error('invalid GPX document');
    parseGPXWithCustomParser.mockResolvedValueOnce([null, error]);

    await expect(getCoordinatesFromGpxFile('/tmp/activity.gpx')).rejects.toBe(error);
  });

  it('rejects when the GPX parser returns no document and no error', async () => {
    parseGPXWithCustomParser.mockResolvedValueOnce([null, null]);

    await expect(getCoordinatesFromGpxFile('/tmp/activity.gpx')).rejects.toThrow('Не удалось разобрать GPX-файл');
  });

  it('rethrows malformed file errors', async () => {
    const error = new Error('invalid GPX');
    readFile.mockRejectedValue(error);

    await expect(getCoordinatesFromGpxFile('/tmp/activity.gpx')).rejects.toBe(error);
  });
});
