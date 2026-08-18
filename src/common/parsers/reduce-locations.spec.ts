import type { LocationObject } from 'src/activity/activity.dto';
import { MAX_ACTIVITY_LOCATIONS } from 'src/common/constants';
import { reduceLocations } from './reduce-locations';

function createLocations(length: number): LocationObject[] {
  return Array.from({ length }, (_, index) => ({
    coords: { latitude: index, longitude: index },
  }));
}

describe('reduceLocations', () => {
  it('preserves the endpoints and caps the stored route at the API limit', () => {
    const locations = createLocations(MAX_ACTIVITY_LOCATIONS + 123);
    const reduced = reduceLocations(locations);

    expect(reduced).toHaveLength(MAX_ACTIVITY_LOCATIONS);
    expect(reduced[0]).toBe(locations[0]);
    expect(reduced.at(-1)).toBe(locations.at(-1));
  });

  it('does not create a copy when the route is already within the limit', () => {
    const locations = createLocations(2);

    expect(reduceLocations(locations)).toBe(locations);
  });
});
