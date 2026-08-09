import { randomInt } from 'node:crypto';
import polyline from '@mapbox/polyline';

export function getTimeStampFromTime(date: Date) {
  return new Date(date).getTime() / 1000;
}

export function getMapBoxImage({ location }: { location: { coords: { latitude: number; longitude: number } }[] }) {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MAPBOX_ACCESS_TOKEN must be configured');
  }

  if (location.length) {
    const polylineLatLang = location.map(({ coords }) => [coords.latitude, coords.longitude]);
    const encodedPolyline = polyline.encode(polylineLatLang);

    const initialCoordinate = [location[0].coords.longitude, location[0].coords.latitude];
    const lastCoordinate = [
      location[location.length - 1].coords.longitude,
      location[location.length - 1].coords.latitude,
    ];
    const lineOpacity = 0.8;
    const lineWidth = 2;
    const lineColor = 'F66767';
    const width = 350;
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

export function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return randomInt(min, max + 1);
}
