import sharp from 'sharp';
import {
  MAX_STATIC_MAP_LOCATIONS,
  STATIC_MAP_ATTRIBUTION,
  STATIC_MAP_HEIGHT,
  STATIC_MAP_MAX_ZOOM,
  STATIC_MAP_MIN_ZOOM,
  STATIC_MAP_SIMPLIFICATION_TOLERANCE_METERS,
  STATIC_MAP_TILE_SIZE,
  STATIC_MAP_TILE_ZOOM_OFFSET,
  STATIC_MAP_WEBP_EFFORT,
  STATIC_MAP_WEBP_QUALITY,
  STATIC_MAP_WIDTH,
  STATIC_MAP_ZOOM_FIT_PADDING_PX,
} from './static-map.constants';
import type { LocationObject } from 'src/activity/activity.dto';
import type { StaticMapTile, StaticMapTileResult } from './static-map.types';

export async function fetchStaticMapTile(
  tile: StaticMapTile,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<StaticMapTileResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(tile.url, { headers, signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`Tile provider вернул HTTP ${response.status} и тип ${contentType || 'unknown'}`);
    }

    return {
      success: true,
      tile: { url: tile.url, box: tile.box, body: Buffer.from(await response.arrayBuffer()) },
    };
  } catch (error) {
    return { success: false, error };
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeStaticMapLocations(locations: LocationObject[]) {
  const validLocations = locations.filter(
    ({ coords }) =>
      Number.isFinite(coords?.longitude) &&
      Number.isFinite(coords?.latitude) &&
      coords.longitude >= -180 &&
      coords.longitude <= 180 &&
      coords.latitude >= -90 &&
      coords.latitude <= 90,
  );

  return simplifyStaticMapLocations(validLocations);
}

export function simplifyStaticMapLocations(locations: LocationObject[], maxPoints = MAX_STATIC_MAP_LOCATIONS) {
  if (locations.length <= maxPoints) return locations;

  const projectedLocations = locations.map((location, index) => ({
    index,
    ...projectLocation(location),
  }));
  const extremeIndexes = getRouteExtremeIndexes(projectedLocations);
  let toleranceMeters = STATIC_MAP_SIMPLIFICATION_TOLERANCE_METERS;
  let selectedIndexes = getRamerDouglasPeuckerIndexes(projectedLocations, toleranceMeters, extremeIndexes);

  for (let iteration = 0; selectedIndexes.length > maxPoints && iteration < 24; iteration += 1) {
    toleranceMeters *= 2;
    selectedIndexes = getRamerDouglasPeuckerIndexes(projectedLocations, toleranceMeters, extremeIndexes);
  }

  return selectedIndexes.map((index) => locations[index]);
}

type ProjectedLocation = { index: number; x: number; y: number };

const WEB_MERCATOR_RADIUS_METERS = 6_378_137;

function projectLocation(location: LocationObject) {
  const longitudeRadians = (location.coords.longitude * Math.PI) / 180;
  const latitudeRadians = (Math.max(-85.05112878, Math.min(85.05112878, location.coords.latitude)) * Math.PI) / 180;

  return {
    x: WEB_MERCATOR_RADIUS_METERS * longitudeRadians,
    y: WEB_MERCATOR_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)),
  };
}

function getRouteExtremeIndexes(points: ProjectedLocation[]) {
  const indexes = new Set<number>([points[0].index, points.at(-1)?.index ?? points[0].index]);
  const extremePoints = [
    points.reduce((current, point) => (point.x < current.x ? point : current)),
    points.reduce((current, point) => (point.x > current.x ? point : current)),
    points.reduce((current, point) => (point.y < current.y ? point : current)),
    points.reduce((current, point) => (point.y > current.y ? point : current)),
  ];

  extremePoints.forEach((point) => indexes.add(point.index));
  return indexes;
}

function getRamerDouglasPeuckerIndexes(
  points: ProjectedLocation[],
  toleranceMeters: number,
  requiredIndexes: Set<number>,
) {
  const selectedIndexes = new Set<number>(requiredIndexes);
  const segments: Array<[number, number]> = [[0, points.length - 1]];

  while (segments.length) {
    const [startIndex, endIndex] = segments.pop()!;
    let farthestIndex = -1;
    let farthestDistance = toleranceMeters;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = getPointToSegmentDistance(points[index], points[startIndex], points[endIndex]);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }

    if (farthestIndex >= 0) {
      selectedIndexes.add(farthestIndex);
      segments.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
    }
  }

  return [...selectedIndexes].sort((left, right) => left - right);
}

function getPointToSegmentDistance(point: ProjectedLocation, start: ProjectedLocation, end: ProjectedLocation) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const segmentLengthSquared = deltaX ** 2 + deltaY ** 2;

  if (segmentLengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / segmentLengthSquared),
  );
  const projectedX = start.x + projection * deltaX;
  const projectedY = start.y + projection * deltaY;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

export function calculateStaticMapBbox(route: [number, number][]): [number, number, number, number] {
  const longitudes = route.map(([longitude]) => longitude);
  const latitudes = route.map(([, latitude]) => latitude);

  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

export type StaticMapViewport = {
  zoom: number;
  tileZoom: number;
  scale: number;
  center: [number, number];
  crop: { left: number; top: number; width: number; height: number };
};

export function calculateStaticMapViewport(route: [number, number][]): StaticMapViewport {
  if (!route.length) throw new Error('Для расчёта viewport static map нужен маршрут');

  const availableWidth = STATIC_MAP_WIDTH - STATIC_MAP_ZOOM_FIT_PADDING_PX * 2;
  const availableHeight = STATIC_MAP_HEIGHT - STATIC_MAP_ZOOM_FIT_PADDING_PX * 2;
  const fits = (zoom: number) => {
    const extent = getProjectedStaticMapExtent(route, zoom);
    return (
      (extent.maxX - extent.minX) * STATIC_MAP_TILE_SIZE <= availableWidth &&
      (extent.maxY - extent.minY) * STATIC_MAP_TILE_SIZE <= availableHeight
    );
  };

  let zoom: number;
  if (!fits(STATIC_MAP_MIN_ZOOM)) {
    zoom = STATIC_MAP_MIN_ZOOM;
  } else if (fits(STATIC_MAP_MAX_ZOOM)) {
    zoom = STATIC_MAP_MAX_ZOOM;
  } else {
    let low = STATIC_MAP_MIN_ZOOM;
    let high = STATIC_MAP_MAX_ZOOM;
    for (let iteration = 0; iteration < 48; iteration += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    zoom = low;
  }

  const normalizedZoom = normalizeZoomPrecision(zoom);
  const extent = getProjectedStaticMapExtent(route, normalizedZoom);
  const center: [number, number] = [
    xToLongitude((extent.minX + extent.maxX) / 2, normalizedZoom),
    yToLatitude((extent.minY + extent.maxY) / 2, normalizedZoom),
  ];
  const tileZoom = Math.max(STATIC_MAP_MIN_ZOOM, Math.floor(normalizedZoom) - STATIC_MAP_TILE_ZOOM_OFFSET);
  const scale = 2 ** (normalizedZoom - tileZoom);
  const crop = {
    left: Math.round((STATIC_MAP_WIDTH - STATIC_MAP_WIDTH / scale) / 2),
    top: Math.round((STATIC_MAP_HEIGHT - STATIC_MAP_HEIGHT / scale) / 2),
    width: Math.max(1, Math.round(STATIC_MAP_WIDTH / scale)),
    height: Math.max(1, Math.round(STATIC_MAP_HEIGHT / scale)),
  };

  return { zoom: normalizedZoom, tileZoom, scale, center, crop };
}

function getProjectedStaticMapExtent(route: [number, number][], zoom: number) {
  const projectedRoute = route.map(
    ([longitude, latitude]) => [longitudeToX(longitude, zoom), latitudeToY(latitude, zoom)] as [number, number],
  );
  const minX = Math.min(...projectedRoute.map(([x]) => x));
  const maxX = Math.max(...projectedRoute.map(([x]) => x));
  const minY = Math.min(...projectedRoute.map(([, y]) => y));
  const maxY = Math.max(...projectedRoute.map(([, y]) => y));

  return { minX, minY, maxX, maxY };
}

function longitudeToX(longitude: number, zoom: number) {
  return ((longitude + 180) / 360) * 2 ** zoom;
}

function latitudeToY(latitude: number, zoom: number) {
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const latitudeRadians = (clampedLatitude * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) * 2 ** zoom;
}

function xToLongitude(x: number, zoom: number) {
  return (x / 2 ** zoom) * 360 - 180;
}

function yToLatitude(y: number, zoom: number) {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) / Math.PI) * 180;
}

function normalizeZoomPrecision(zoom: number) {
  const roundedZoom = Math.round(zoom);
  return Math.abs(zoom - roundedZoom) < 1e-7 ? roundedZoom : zoom;
}

export async function addAttribution(input: Buffer) {
  const fontSize = 11;
  const boxWidth = Math.max(150, STATIC_MAP_ATTRIBUTION.length * 6 + 16);
  const boxHeight = 19;
  const overlay = Buffer.from(
    `<svg width="${STATIC_MAP_WIDTH}" height="${STATIC_MAP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${STATIC_MAP_WIDTH - boxWidth - 6}" y="${STATIC_MAP_HEIGHT - boxHeight - 6}" width="${boxWidth}" height="${boxHeight}" rx="3" fill="#FFFFFFCC"/>` +
      `<text x="${STATIC_MAP_WIDTH - 14}" y="${STATIC_MAP_HEIGHT - 13}" text-anchor="end" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#222">${escapeXml(STATIC_MAP_ATTRIBUTION)}</text>` +
      '</svg>',
  );

  return await sharp(input)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .webp({ quality: STATIC_MAP_WEBP_QUALITY, effort: STATIC_MAP_WEBP_EFFORT, smartSubsample: true })
    .toBuffer();
}

export async function cropStaticMapToViewport(input: Buffer, viewport: StaticMapViewport) {
  if (viewport.scale === 1) return input;

  return await sharp(input)
    .extract(viewport.crop)
    .resize({ width: STATIC_MAP_WIDTH, height: STATIC_MAP_HEIGHT, fit: 'fill' })
    .png()
    .toBuffer();
}

export async function validateStaticMap(input: Buffer) {
  const metadata = await sharp(input).metadata();
  if (
    metadata.format !== 'webp' ||
    metadata.width !== STATIC_MAP_WIDTH ||
    metadata.height !== STATIC_MAP_HEIGHT ||
    input.byteLength < 1_000
  ) {
    throw new Error('Static map вернул изображение некорректного размера или формата');
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => {
    const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
    return entities[character];
  });
}
