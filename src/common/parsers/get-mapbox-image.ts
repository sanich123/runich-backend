import polyline from '@mapbox/polyline';
import { LocationObject } from 'src/activity/activity.dto';
import { STATIC_MAP_ROUTE_WIDTH } from 'src/common/maps/static-map.constants';
import { simplifyStaticMapLocations } from 'src/common/maps/static-map.utils';

const MAX_STATIC_MAP_URL_LENGTH = 7600;
const STATIC_MAP_IMAGE_WIDTH = 896;
const STATIC_MAP_IMAGE_HEIGHT = 538;

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
    const lineOpacity = 0.8;
    const lineWidth = STATIC_MAP_ROUTE_WIDTH;
    const routeOverlay =
      routeLocations.length > 1
        ? `path-${lineWidth}+EA5B22-${lineOpacity}(${encodeURIComponent(encodedPolyline)})`
        : '';
    const overlays = routeOverlay ? `${routeOverlay}/` : '';

    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlays}auto/${STATIC_MAP_IMAGE_WIDTH}x${STATIC_MAP_IMAGE_HEIGHT}?access_token=${accessToken}`;
  };

  let reducedLocations = simplifyStaticMapLocations(validLocations);
  let imageUrl = buildUrl(reducedLocations);

  while (imageUrl.length > MAX_STATIC_MAP_URL_LENGTH && reducedLocations.length > 2) {
    const nextLimit = Math.max(2, Math.floor(reducedLocations.length * 0.75));
    const nextLocations = simplifyStaticMapLocations(reducedLocations, nextLimit);

    reducedLocations = nextLocations;
    imageUrl = buildUrl(reducedLocations);
  }

  return imageUrl;
}
