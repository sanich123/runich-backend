import sharp from 'sharp';
import {
  MAX_STATIC_MAP_LOCATIONS,
  STATIC_MAP_ATTRIBUTION,
  STATIC_MAP_HEIGHT,
  STATIC_MAP_WEBP_EFFORT,
  STATIC_MAP_WEBP_QUALITY,
  STATIC_MAP_WIDTH,
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

  if (validLocations.length <= MAX_STATIC_MAP_LOCATIONS) return validLocations;

  return Array.from({ length: MAX_STATIC_MAP_LOCATIONS }, (_, index) => {
    const sourceIndex = Math.round((index * (validLocations.length - 1)) / (MAX_STATIC_MAP_LOCATIONS - 1));
    return validLocations[sourceIndex];
  });
}

export function calculateStaticMapBbox(route: [number, number][]): [number, number, number, number] {
  const longitudes = route.map(([longitude]) => longitude);
  const latitudes = route.map(([, latitude]) => latitude);

  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

export function getMarkerDrawSize(size: number) {
  return Math.max(1, Math.round(size) - 1);
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
