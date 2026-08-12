import polyline from '@mapbox/polyline';
import { LocationObject } from 'src/activity/activity.dto';

export function getMapBoxImage(locations: LocationObject[]) {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('Не настроен токен Mapbox: MAPBOX_ACCESS_TOKEN');
  }

  if (locations?.length > 1 && 'coords' in locations[0]) {
    const polylineLatLang = locations.map(({ coords }) => [coords.latitude, coords.longitude]);
    const encodedPolyline = polyline.encode(polylineLatLang);

    const initialCoordinate = [locations[0].coords.longitude, locations[0].coords.latitude];
    const lastCoordinate = [
      locations[locations.length - 1].coords.longitude,
      locations[locations.length - 1].coords.latitude,
    ];
    const lineOpacity = 0.8;
    const lineWidth = 2;
    const lineColor = 'F66767';
    const width = 900;
    const height = 200;
    const doublePixels = '@2x';
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s-a+9ed4bd(${initialCoordinate[0]},${
      initialCoordinate[1]
    }),pin-s-b+000(${lastCoordinate[0]},${lastCoordinate[1]}),path-${lineWidth}+${lineColor}-${lineOpacity}(${encodeURIComponent(
      encodedPolyline,
    )})/auto/${width}x${height}${doublePixels}?access_token=${accessToken}`;
  }

  return '';
}
