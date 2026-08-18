import type { LocationObject } from 'src/activity/activity.dto';
import { calculateKilometreSplits } from './calculate-kilometre-splits';

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
  it('creates an interpolated point and positive elevation gain at every crossed kilometre', () => {
    const splits = calculateKilometreSplits(createRoute([100, 101, 102, 112, 113, 114, 114, 120, 121]), 2_400_000);

    expect(splits).toHaveLength(2);
    expect(splits[0].lastKilometerDuration).toBeCloseTo(1_200_000, -1);
    expect(splits[0].lastKilometerAltitude).toBeCloseTo(12, 5);
    expect(splits[0].kilometerPoint.coords.longitude).toBeCloseTo(1_000 / METERS_PER_EQUATOR_DEGREE, 5);
    expect(splits[0].kilometerPoint.coords.altitude).toBeCloseTo(113, 5);
    expect(splits[1].lastKilometerAltitude).toBeCloseTo(7, 5);
    expect(splits.every(({ lastKilometerAltitude }) => lastKilometerAltitude >= 0)).toBe(true);
  });

  it('uses distance-proportional duration when imported points have no timestamps', () => {
    const splits = calculateKilometreSplits(createRoute([100, 100, 100, 100, 100], false), 1_000_000);

    expect(splits).toHaveLength(1);
    expect(splits[0].lastKilometerDuration).toBeCloseTo(1_000_000, -1);
    expect(splits[0].lastKilometerAltitude).toBe(0);
  });

  it('does not count a short altitude fluctuation as elevation gain', () => {
    const splits = calculateKilometreSplits(createRoute([100, 104, 102, 105, 103]), 1_000_000);

    expect(splits).toHaveLength(1);
    expect(splits[0].lastKilometerAltitude).toBe(0);
  });
});
