import {
  getElevationGainFromKilometreSplits,
  getElevationGainFromLocations,
  createActivityChartLocations,
  normalizeActivityCard,
  normalizeActivityCardForViewer,
  normalizeActivityDetails,
  omitMediaProcessingStatus,
} from '../utils';

describe('activity utilities', () => {
  it('removes media processing status only from object values', () => {
    expect(omitMediaProcessingStatus(null)).toBeNull();
    expect(omitMediaProcessingStatus('queued')).toBe('queued');
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
    expect(getElevationGainFromLocations([{ coords: { altitude: 100 } }])).toBe(0);
    expect(getElevationGainFromLocations(undefined)).toBe(0);
  });

  it('calculates a smoothed climb and ignores implausible vertical speed', () => {
    const climb = [100, 110, 120, 120, 116, 116].map((altitude, index) => ({
      timestamp: index * 2_000,
      coords: { altitude },
    }));
    expect(getElevationGainFromLocations(climb)).toBe(10);

    const gradualDescent = [100, 110, 120, 120, 118, 118].map((altitude, index) => ({
      timestamp: index * 2_000,
      coords: { altitude },
    }));
    expect(getElevationGainFromLocations(gradualDescent)).toBe(10);

    const implausibleClimb = [100, 110, 120, 120, 100, 100].map((altitude, index) => ({
      timestamp: index * 1_000,
      coords: { altitude },
    }));
    expect(getElevationGainFromLocations(implausibleClimb)).toBe(0);

    const noTimestampClimb = [100, 110, 120, 120, 100, 100].map((altitude) => ({ coords: { altitude } }));
    expect(getElevationGainFromLocations(noTimestampClimb)).toBe(20);
  });

  it('hides restricted card elevation from other viewers but keeps it for the owner', () => {
    const activity = {
      id: 'activity-1',
      userId: 'owner-1',
      elevationGain: 40,
      profile: { allowActivityElevationViewing: false },
    };

    expect(normalizeActivityCardForViewer(activity, 'viewer-1')).toMatchObject({ elevationGain: null });
    expect(normalizeActivityCardForViewer(activity, 'owner-1')).toMatchObject({ elevationGain: 40 });
    expect(normalizeActivityCardForViewer(activity)).toMatchObject({ elevationGain: null });
    expect(
      normalizeActivityCardForViewer({ ...activity, profile: { allowActivityElevationViewing: true } }, 'viewer-1'),
    ).toMatchObject({ elevationGain: 40 });
  });

  it('creates privacy-filtered chart samples without exposing route coordinates', () => {
    const locations = [
      { timestamp: 1_000, coords: { latitude: 0, longitude: 0, altitude: 100, timestamp: 1_000 } },
      { timestamp: 61_000, coords: { latitude: 0, longitude: 0.001, altitude: 110, timestamp: 61_000 } },
    ];

    const samples = createActivityChartLocations(locations, 111, true, true);

    expect(samples).toHaveLength(2);
    expect(samples[0]).toEqual({ timestamp: 1_000, coords: { altitude: 100, timestamp: 1_000 } });
    expect(samples[1]?.coords).toEqual(
      expect.objectContaining({ altitude: 110, timestamp: 61_000, speed: expect.any(Number) }),
    );
    expect(samples[1]?.coords.speed).toBeGreaterThan(0);
    expect(samples[0]?.coords).not.toHaveProperty('latitude');
    expect(samples[0]?.coords).not.toHaveProperty('longitude');
    expect(createActivityChartLocations(locations, 111, false, true)[1]?.coords).toEqual({
      altitude: 110,
      timestamp: 61_000,
    });
    expect(createActivityChartLocations(locations, 111, true, false)[0]?.coords).toEqual({ timestamp: 1_000 });

    const fallbackTimestampLocations = [
      { coords: { latitude: 0, longitude: 0, altitude: 100, timestamp: 1_000 } },
      { timestamp: 61_000, coords: { latitude: 0, longitude: 0.001, altitude: 110 } },
      { timestamp: 0, coords: { latitude: 0, longitude: 0.002, altitude: 120 } },
      { coords: { latitude: 0, longitude: 0.003, altitude: 130 } },
    ];
    const fallbackTimestampSamples = createActivityChartLocations(fallbackTimestampLocations, 0, true, true);
    expect(fallbackTimestampSamples).toHaveLength(2);
    expect(fallbackTimestampSamples[0]?.timestamp).toBe(1_000);
    expect(fallbackTimestampSamples[1]?.timestamp).toBe(61_000);
    expect(fallbackTimestampSamples[1]?.coords).not.toHaveProperty('timestamp');
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
    expect(
      normalizeActivityDetails({ id: 'activity-7', elevationGain: Number.POSITIVE_INFINITY, kilometresSplit: [] }),
    ).toEqual({ id: 'activity-7', elevationGain: 0, kilometresSplit: [] });
  });
});
