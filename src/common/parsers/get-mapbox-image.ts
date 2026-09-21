import polyline from '@mapbox/polyline';
import { LocationObject } from 'src/activity/activity.dto';

const MAX_STATIC_MAP_URL_LENGTH = 7600;
const MAX_STATIC_MAP_LOCATIONS = 500;
const STATIC_MAP_IMAGE_WIDTH = 896;
const STATIC_MAP_IMAGE_HEIGHT = 504;

export function getMapBoxImage(locations: LocationObject[]) {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('Не настроен токен Mapbox: MAPBOX_ACCESS_TOKEN');
  }

  const validLocations = locations.filter(
    ({ coords }) => Number.isFinite(coords?.longitude) && Number.isFinite(coords?.latitude),
  );

  if (!validLocations.length) return '';

  const buildUrl = (routeLocations: LocationObject[]) => {
    const polylineLatLang = routeLocations.map(({ coords }) => [coords.latitude, coords.longitude]);
    const encodedPolyline = polyline.encode(polylineLatLang);
    const initialCoordinate = [routeLocations[0].coords.longitude, routeLocations[0].coords.latitude];
    const lastCoordinate = [
      routeLocations[routeLocations.length - 1].coords.longitude,
      routeLocations[routeLocations.length - 1].coords.latitude,
    ];
    const lineOpacity = 0.8;
    const lineWidth = 2;
    // Keep the marker style used by the original activity cards. Mapbox's
    // `pin-s-a`/`pin-s-b` assets render as the large black A/B pins shown in
    // the legacy client screenshots.
    const startMarkerColor = '000';
    const finishMarkerColor = '000';
    const routeOverlay =
      routeLocations.length > 1
        ? `path-${lineWidth}+F66767-${lineOpacity}(${encodeURIComponent(encodedPolyline)})`
        : '';
    const startMarker = `pin-s-a+${startMarkerColor}(${initialCoordinate.join(',')})`;
    const finishMarker = `pin-s-b+${finishMarkerColor}(${lastCoordinate.join(',')})`;
    const overlays = [startMarker, finishMarker, routeOverlay].filter(Boolean).join(',');

    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays}/auto/${STATIC_MAP_IMAGE_WIDTH}x${STATIC_MAP_IMAGE_HEIGHT}?access_token=${accessToken}&attribution=false&logo=false`;
  };

  let reducedLocations = reduceLocations(validLocations, MAX_STATIC_MAP_LOCATIONS);
  let imageUrl = buildUrl(reducedLocations);

  while (imageUrl.length > MAX_STATIC_MAP_URL_LENGTH && reducedLocations.length > 2) {
    const nextLimit = Math.max(2, Math.floor(reducedLocations.length * 0.75));
    const nextLocations = reduceLocations(reducedLocations, nextLimit);

    reducedLocations = nextLocations;
    imageUrl = buildUrl(reducedLocations);
  }

  return imageUrl;
}

function reduceLocations(locations: LocationObject[], maxLocations: number) {
  if (locations.length <= maxLocations) return locations;

  return Array.from({ length: maxLocations }, (_, index) => {
    const sourceIndex = Math.round((index * (locations.length - 1)) / (maxLocations - 1));
    return locations[sourceIndex];
  });
}
