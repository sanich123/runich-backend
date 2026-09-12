import {
  getElevationGainFromKilometreSplits,
  getElevationGainFromLocations,
  normalizeActivityCard,
  normalizeActivityDetails,
  omitMediaProcessingStatus,
} from '../utils';

describe('activity utilities', () => {
  it('removes media processing status only from object values', () => {
    expect(omitMediaProcessingStatus(null)).toBeNull();
    expect(omitMediaProcessingStatus(['queued'])).toEqual(['queued']);
    expect(omitMediaProcessingStatus({ id: 'activity-1', mediaProcessingStatus: 'queued' })).toEqual({
      id: 'activity-1',
    });
  });

  it('calculates positive elevation from kilometre splits and ignores invalid values', () => {
    expect(getElevationGainFromKilometreSplits(undefined)).toBe(0);
    expect(
      getElevationGainFromKilometreSplits([
        null,
        {},
        { lastKilometerAltitude: '120' },
        { lastKilometerAltitude: Number.NaN },
        { lastKilometerAltitude: -4 },
        { lastKilometerAltitude: 12 },
      ]),
    ).toBe(12);
  });

  it('filters unreliable locations before calculating elevation', () => {
    const invalidLocations = [
      null,
      'invalid',
      { coords: {} },
      { coords: { altitude: Number.NaN } },
      { coords: { altitude: 100, altitudeAccuracy: -1 } },
      { coords: { altitude: 100, altitudeAccuracy: 16 } },
      { coords: { altitude: 100, altitudeAccuracy: '16' } },
      { coords: { altitude: 100 }, mocked: true },
      { coords: { altitude: 100, mocked: true } },
    ];

    expect(getElevationGainFromLocations([...invalidLocations, { coords: { altitude: 100 } }])).toBe(0);
  });

  it('calculates a smoothed climb and ignores implausible vertical speed', () => {
    const climb = [100, 110, 120, 120, 116, 116].map((altitude, index) => ({
      timestamp: index * 2_000,
      coords: { altitude },
    }));
    expect(getElevationGainFromLocations(climb)).toBe(10);

    const implausibleClimb = [100, 110, 120, 120, 100, 100].map((altitude, index) => ({
      timestamp: index * 1_000,
      coords: { altitude },
    }));
    expect(getElevationGainFromLocations(implausibleClimb)).toBe(0);

    const noTimestampClimb = [100, 110, 120, 120, 100, 100].map((altitude) => ({ coords: { altitude } }));
    expect(getElevationGainFromLocations(noTimestampClimb)).toBe(20);
  });

  it('normalizes activity cards and details using stored or derived elevation', () => {
    const plainActivity = { id: 'activity-1' };
    expect(normalizeActivityCard(plainActivity)).toBe(plainActivity);
    expect(normalizeActivityDetails(plainActivity)).toBe(plainActivity);

    expect(normalizeActivityCard({ id: 'activity-2', elevationGain: 14, kilometresSplit: [] })).toEqual({
      id: 'activity-2',
      elevationGain: 14,
    });
    expect(normalizeActivityCard({ id: 'activity-3', kilometresSplit: [{ lastKilometerAltitude: 7 }] })).toEqual({
      id: 'activity-3',
      elevationGain: 7,
    });
    expect(normalizeActivityCard({ id: 'activity-4', elevationGain: Number.NaN, kilometresSplit: [] })).toEqual({
      id: 'activity-4',
      elevationGain: 0,
    });

    const detailedActivity = { id: 'activity-5', elevationGain: 9 };
    expect(normalizeActivityDetails(detailedActivity)).toBe(detailedActivity);
    expect(normalizeActivityDetails({ id: 'activity-6', kilometresSplit: [{ lastKilometerAltitude: 5 }] })).toEqual({
      id: 'activity-6',
      kilometresSplit: [{ lastKilometerAltitude: 5 }],
      elevationGain: 5,
    });
  });
});
