import { jest } from '@jest/globals';

const readFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const importFromTCX = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('node:fs/promises', () => ({ readFile }));
jest.unstable_mockModule('@ardentcode/sports-lib', () => ({ SportsLib: { importFromTCX } }));

const { parseTcxActivityFromFile } = await import('../get-coordinates-from-tcx');

describe('parseTcxActivityFromFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readFile.mockResolvedValue(
      '<TrainingCenterDatabase><Activities><Activity Sport="Running"><Lap StartTime="2026-08-22T10:00:00Z">' +
        '<Track><Trackpoint><Time>2026-08-22T10:00:00Z</Time><Position><LatitudeDegrees>55.75</LatitudeDegrees>' +
        '<LongitudeDegrees>37.61</LongitudeDegrees></Position><AltitudeMeters>150</AltitudeMeters></Trackpoint></Track>' +
        '</Lap></Activity></Activities></TrainingCenterDatabase>',
    );
    importFromTCX.mockResolvedValue({ getActivities: () => [] });
  });

  it('reads TCX once and returns coordinates and heart-rate data from the same XML document', async () => {
    await expect(parseTcxActivityFromFile('/tmp/activity.tcx')).resolves.toEqual({
      locations: [
        {
          coords: {
            latitude: 55.75,
            longitude: 37.61,
            altitude: 150,
            timestamp: new Date('2026-08-22T10:00:00Z').getTime(),
          },
        },
      ],
      heartRateData: { samples: [] },
    });

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith('/tmp/activity.tcx', { encoding: 'utf-8' });
    expect(importFromTCX).toHaveBeenCalledTimes(1);
    expect(importFromTCX).toHaveBeenCalledWith(expect.any(Object));
  });

  it('keeps route coordinates when the optional heart-rate parser rejects the document', async () => {
    importFromTCX.mockRejectedValueOnce(new Error('heart-rate stream unavailable'));

    await expect(parseTcxActivityFromFile('/tmp/activity.tcx')).resolves.toMatchObject({
      locations: [
        {
          coords: {
            latitude: 55.75,
            longitude: 37.61,
          },
        },
      ],
      heartRateData: { samples: [] },
    });
  });

  it('returns an empty route when the XML has no activity', async () => {
    readFile.mockResolvedValueOnce('<TrainingCenterDatabase/>');

    await expect(parseTcxActivityFromFile('/tmp/activity.tcx')).resolves.toEqual({
      locations: [],
      heartRateData: { samples: [] },
    });
  });

  it('handles missing positions and invalid optional altitude and timestamps', async () => {
    readFile.mockResolvedValueOnce(
      '<TrainingCenterDatabase><Activities><Activity><Lap><Track>' +
        '<Trackpoint/>' +
        '<Trackpoint><Time>invalid</Time><Position><LatitudeDegrees>55.75</LatitudeDegrees>' +
        '<LongitudeDegrees>37.61</LongitudeDegrees></Position><AltitudeMeters>invalid</AltitudeMeters></Trackpoint>' +
        '</Track></Lap></Activity></Activities></TrainingCenterDatabase>',
    );

    await expect(parseTcxActivityFromFile('/tmp/activity.tcx')).resolves.toMatchObject({
      locations: [
        { coords: { latitude: 0, longitude: 0, timestamp: 0 } },
        { coords: { latitude: 55.75, longitude: 37.61 } },
      ],
      heartRateData: { samples: [] },
    });
  });

  it('rejects when the TCX file cannot be read', async () => {
    const error = new Error('file read failed');
    readFile.mockRejectedValueOnce(error);

    await expect(parseTcxActivityFromFile('/tmp/missing.tcx')).rejects.toBe(error);
  });
});
