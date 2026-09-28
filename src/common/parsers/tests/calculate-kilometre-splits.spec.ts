import type { LocationObject } from 'src/activity/activity.dto';
import { calculateKilometreSplits } from '../calculate-kilometre-splits';

const METERS_PER_EQUATOR_DEGREE = 111_195.080233;

function createRoute(altitudes: number[], withTimestamps = true): LocationObject[] {
  return altitudes.map((altitude, index) => ({
    coords: {
      latitude: 0,
      longitude: (index * 250) / METERS_PER_EQUATOR_DEGREE,
      altitude,
      ...(withTimestamps ? { timestamp: index * 300_000 } : {}),
    },
  }));
}

describe('calculateKilometreSplits', () => {
  it('returns no splits for short, invalid, or zero-distance routes', () => {
    const onePoint = createRoute([100])[0];
    const invalidPoint = { coords: { latitude: Number.NaN, longitude: 0 } };

    expect(calculateKilometreSplits([], 60_000)).toEqual([]);
    expect(calculateKilometreSplits([onePoint], 60_000)).toEqual([]);
    expect(calculateKilometreSplits([invalidPoint, onePoint], 60_000)).toEqual([]);
    expect(calculateKilometreSplits([onePoint, { ...onePoint }], 60_000)).toEqual([]);
    expect(calculateKilometreSplits(createRoute([100, 101]), 60_000, 0)).toEqual([]);
  });

  it('ignores invalid declared distances and falls back to geometry', () => {
    const route = createRoute([100, 100, 100, 100, 100], false);

    expect(calculateKilometreSplits(route, 1_000_000, -1)).toHaveLength(1);
    expect(calculateKilometreSplits(route, 1_000_000, Number.NaN)).toHaveLength(1);
  });

  it('creates an interpolated point and assigns signed elevation changes to every crossed kilometre', () => {
    const splits = calculateKilometreSplits(createRoute([100, 101, 102, 112, 113, 114, 114, 120, 121]), 2_400_000);

    expect(splits).toHaveLength(2);
    expect(splits[0].lastKilometerDuration).toBeCloseTo(1_200_000, -1);
    expect(splits[0].lastKilometerAltitude).toBeCloseTo(12, 5);
    expect(splits[0].kilometerPoint.coords.longitude).toBeCloseTo(1_000 / METERS_PER_EQUATOR_DEGREE, 5);
    expect(splits[0].kilometerPoint.coords.altitude).toBeCloseTo(113, 5);
    expect(splits[1].lastKilometerAltitude).toBeCloseTo(7, 5);
  });

  it('uses distance-proportional duration when imported points have no timestamps', () => {
    const splits = calculateKilometreSplits(createRoute([100, 100, 100, 100, 100], false), 1_000_000);

    expect(splits).toHaveLength(1);
    expect(splits[0].lastKilometerDuration).toBeCloseTo(1_000_000, -1);
    expect(splits[0].lastKilometerAltitude).toBe(0);
  });

  it('scales timestamp durations when moving time is shorter than elapsed time', () => {
    const splits = calculateKilometreSplits(createRoute([100, 100, 100, 100, 100]), 1_000_000);

    expect(splits).toHaveLength(1);
    expect(splits[0].lastKilometerDuration).toBeCloseTo(1_000_000, -1);
  });

  it('uses the same median smoothing as the client for short altitude fluctuations', () => {
    const splits = calculateKilometreSplits(createRoute([100, 104, 102, 105, 103]), 1_000_000);

    expect(splits).toHaveLength(1);
    expect(splits[0].lastKilometerAltitude).toBeCloseTo(1, 5);
  });

  it('keeps a sustained imported climb below the live-tracker threshold', () => {
    const splits = calculateKilometreSplits(createRoute([100, 101, 102, 103, 104]), 1_000_000);

    expect(splits).toHaveLength(1);
    expect(splits[0].lastKilometerAltitude).toBeCloseTo(2, 5);
  });

  it('preserves descent as a negative elevation change in its kilometre', () => {
    const locations = [100, 100, 100, 136, 136, 136, 136, 136, 124, 124, 124, 124, 124].map((altitude, index) => ({
      coords: {
        latitude: 0,
        longitude: (index * 200) / METERS_PER_EQUATOR_DEGREE,
        altitude,
      },
    }));

    const splits = calculateKilometreSplits(locations, 2_400_000);

    expect(splits).toHaveLength(2);
    expect(splits[0].lastKilometerAltitude).toBeCloseTo(36, 3);
    expect(splits[1].lastKilometerAltitude).toBeCloseTo(-12, 3);
  });

  it('uses the declared distance when the route geometry is longer than the activity distance', () => {
    const route = [0, 500, 1_000, 1_500, 2_000].map((meters, index) => ({
      coords: {
        latitude: 0,
        longitude: meters / METERS_PER_EQUATOR_DEGREE,
        altitude: 100,
        timestamp: index * 60_000,
      },
    }));

    const splits = calculateKilometreSplits(route, 120_000, 1_250);

    expect(splits).toHaveLength(1);
    expect(splits[0].kilometerPoint.coords.longitude).toBeCloseTo(1_600 / METERS_PER_EQUATOR_DEGREE, 5);
  });

  it('falls back to proportional timing and interpolates a single available altitude or timestamp', () => {
    const route: LocationObject[] = [
      {
        coords: {
          latitude: 0,
          longitude: 0,
          timestamp: 100_000,
        },
      },
      {
        coords: {
          latitude: 0,
          longitude: 1_500 / METERS_PER_EQUATOR_DEGREE,
          altitude: 120,
        },
      },
    ];

    const splits = calculateKilometreSplits(route, 900_000);

    expect(splits).toHaveLength(1);
    expect(splits[0].lastKilometerDuration).toBeCloseTo(600_000, -1);
    expect(splits[0].kilometerPoint.coords.altitude).toBe(120);
    expect(splits[0].kilometerPoint.coords.timestamp).toBe(100_000);
    expect(splits[0].lastKilometerAltitude).toBe(0);
  });

  it('ignores unreliable altitude samples and implausible timestamped elevation jumps', () => {
    const unreliable = [
      { altitude: 100, altitudeAccuracy: 20 },
      { altitude: 101, mocked: true },
      { altitude: Number.NaN },
      { altitude: 100, altitudeAccuracy: -1 },
      { altitude: 102, altitudeAccuracy: 10 },
      { altitude: 103, altitudeAccuracy: 10 },
    ].map(({ altitude, ...coords }, index) => ({
      coords: {
        latitude: 0,
        longitude: (index * 250) / METERS_PER_EQUATOR_DEGREE,
        altitude,
        ...coords,
      },
    }));
    const splits = calculateKilometreSplits(unreliable, 600_000);

    expect(splits).toHaveLength(1);
    expect(splits[0].lastKilometerAltitude).toBe(0);

    const abruptClimb = [0, 0, 0, 0, 0, 100, 100, 100, 100, 100].map((altitude, index) => ({
      coords: {
        latitude: 0,
        longitude: (index * 250) / METERS_PER_EQUATOR_DEGREE,
        altitude,
        timestamp: index * 30_000,
      },
    }));
    const implausibleSplits = calculateKilometreSplits(abruptClimb, 300_000);

    expect(implausibleSplits).toHaveLength(2);
    expect(implausibleSplits[0].lastKilometerAltitude).toBe(0);
    expect(implausibleSplits[1].lastKilometerAltitude).toBe(0);
  });
});
