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
    const startMarkerColor = '2ACB37';
    const finishMarkerColor = 'EC653C';
    const routeOverlay =
      routeLocations.length > 1
        ? `path-${lineWidth}+${finishMarkerColor}-${lineOpacity}(${encodeURIComponent(encodedPolyline)})`
        : '';
    const startMarker = `pin-s+${startMarkerColor}(${initialCoordinate.join(',')})`;
    const finishMarker = `pin-s+${finishMarkerColor}(${lastCoordinate.join(',')})`;
    const overlays = [routeOverlay, startMarker, finishMarker].filter(Boolean).join(',');

    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays}/auto/${STATIC_MAP_IMAGE_WIDTH}x${STATIC_MAP_IMAGE_HEIGHT}@2x?access_token=${accessToken}&attribution=false&logo=false`;
  };

  let reducedLocations = reduceLocations(validLocations, MAX_STATIC_MAP_LOCATIONS);
  let imageUrl = buildUrl(reducedLocations);

  while (imageUrl.length > MAX_STATIC_MAP_URL_LENGTH && reducedLocations.length > 2) {
    const nextLimit = Math.max(2, Math.floor(reducedLocations.length * 0.75));
    const nextLocations = reduceLocations(reducedLocations, nextLimit);
    if (nextLocations.length >= reducedLocations.length) break;

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
