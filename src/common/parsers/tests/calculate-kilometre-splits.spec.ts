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
});
