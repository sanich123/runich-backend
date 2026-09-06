import { jest } from '@jest/globals';

let parserResult: unknown;
const Parser = jest.fn().mockImplementation(() => parserResult);
jest.unstable_mockModule('tcx-js', () => ({ Parser }));

const { getCoordinatesFromTcxFile } = await import('./get-coordinates-from-tcx');

describe('getCoordinatesFromTcxFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    parserResult = {
      activity: {
        trackpoints: [
          { latitude: '55.75', longitude: '37.61', altitude_meters: '150', epoch_ms: '1000' },
          { latitude: null, longitude: 37.62 },
          { latitude: 55.76, longitude: 37.62, altitude_meters: 'bad', epoch_ms: 'bad' },
        ],
      },
    };
  });

  it('maps valid trackpoints and ignores non-finite optional values', async () => {
    await expect(getCoordinatesFromTcxFile('/tmp/activity.tcx')).resolves.toEqual([
      { coords: { latitude: 55.75, longitude: 37.61, altitude: 150, timestamp: 1000 } },
      { coords: { latitude: 55.76, longitude: 37.62 } },
    ]);
    expect(Parser).toHaveBeenCalledWith('/tmp/activity.tcx');
  });

  it('rethrows parser errors', async () => {
    const error = new Error('invalid TCX');
    Parser.mockImplementation(() => {
      throw error;
    });

    await expect(getCoordinatesFromTcxFile('/tmp/activity.tcx')).rejects.toBe(error);
  });
});
