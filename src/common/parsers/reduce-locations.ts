import { MAX_ACTIVITY_LOCATIONS } from 'src/common/constants';
import type { LocationObject } from 'src/activity/activity.dto';

export function reduceLocations(locations: LocationObject[], maxLocations = MAX_ACTIVITY_LOCATIONS) {
  if (locations.length <= maxLocations) return locations;
  if (maxLocations <= 1) return locations.slice(0, 1);

  return Array.from({ length: maxLocations }, (_, index) => {
    const sourceIndex = Math.round((index * (locations.length - 1)) / (maxLocations - 1));
    return locations[sourceIndex];
  });
}
