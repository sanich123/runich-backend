import sharp from 'sharp';
import {
  STATIC_MAP_HEIGHT,
  STATIC_MAP_ROUTE_COLOR,
  STATIC_MAP_WIDTH,
  STATIC_MAP_WEBP_EFFORT,
  STATIC_MAP_WEBP_QUALITY,
} from './static-map.constants';
import type { LocationObject } from 'src/activity/activity.dto';

const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const ROUTE_MAP_PADDING = 44;

export async function renderRouteOnlyMap(locations: LocationObject[]) {
  const coordinates = locations
    .filter(
      ({ coords }) =>
        Number.isFinite(coords?.longitude) &&
        Number.isFinite(coords?.latitude) &&
        coords.longitude >= -180 &&
        coords.longitude <= 180 &&
        coords.latitude >= -90 &&
        coords.latitude <= 90,
    )
    .map(({ coords }) => {
      const latitude = Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, coords.latitude));
      const latitudeRadians = (latitude * Math.PI) / 180;
      return {
        x: (coords.longitude * Math.PI) / 180,
        y: Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)),
      };
    });

  if (!coordinates.length) throw new Error('Для route-only static map нужен маршрут');

  const minX = Math.min(...coordinates.map(({ x }) => x));
  const maxX = Math.max(...coordinates.map(({ x }) => x));
  const minY = Math.min(...coordinates.map(({ y }) => y));
  const maxY = Math.max(...coordinates.map(({ y }) => y));
  const routeWidth = Math.max(maxX - minX, 0.00001);
  const routeHeight = Math.max(maxY - minY, 0.00001);
  const scale = Math.min(
    (STATIC_MAP_WIDTH - ROUTE_MAP_PADDING * 2) / routeWidth,
    (STATIC_MAP_HEIGHT - ROUTE_MAP_PADDING * 2) / routeHeight,
  );
  const routeCenterX = (minX + maxX) / 2;
  const routeCenterY = (minY + maxY) / 2;
  const points = coordinates.map(({ x, y }) => ({
    x: STATIC_MAP_WIDTH / 2 + (x - routeCenterX) * scale,
    y: STATIC_MAP_HEIGHT / 2 - (y - routeCenterY) * scale,
  }));
  const routePath = points
    .map(({ x, y }, index) => (index === 0 ? 'M ' : 'L ') + x.toFixed(2) + ' ' + y.toFixed(2))
    .join(' ');
  const start = points[0];
  const finish = points[points.length - 1];
  const contourPaths = Array.from({ length: 5 }, (_, index) => {
    const inset = 42 + index * 55;
    const curve = 35 + (index % 2) * 27;
    return (
      '<path d="M -40 ' +
      inset +
      ' C 190 ' +
      (inset - curve) +
      ', 250 ' +
      (inset + curve) +
      ', 480 ' +
      inset +
      ' S 760 ' +
      (inset - curve) +
      ', 940 ' +
      inset +
      '" fill="none" stroke="#25272a" stroke-width="2"/>'
    );
  }).join('');

  const svg = Buffer.from(
    '<svg width="' +
      STATIC_MAP_WIDTH +
      '" height="' +
      STATIC_MAP_HEIGHT +
      '" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#171719"/>' +
      contourPaths +
      '<path d="' +
      routePath +
      '" fill="none" stroke="#111214" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' +
      routePath +
      '" fill="none" stroke="' +
      STATIC_MAP_ROUTE_COLOR +
      '" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' +
      start.x.toFixed(2) +
      '" cy="' +
      start.y.toFixed(2) +
      '" r="13" fill="#f0362f" stroke="#fff" stroke-width="5"/>' +
      '<circle cx="' +
      finish.x.toFixed(2) +
      '" cy="' +
      finish.y.toFixed(2) +
      '" r="11" fill="#171719" stroke="#fff" stroke-width="5"/></svg>',
  );

  return await sharp(svg)
    .webp({ quality: STATIC_MAP_WEBP_QUALITY, effort: STATIC_MAP_WEBP_EFFORT, smartSubsample: true })
    .toBuffer();
}
