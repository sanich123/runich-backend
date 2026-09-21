import { Inject, Injectable, Logger } from '@nestjs/common';
import { join } from 'node:path';
import StaticMaps from 'staticmaps';
import sharp from 'sharp';
import type { LocationObject } from 'src/activity/activity.dto';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { getActivityMapKey } from 'src/storage/storage-key';
import { StorageService } from 'src/storage/storage.service';

const STATIC_MAP_WIDTH = 896;
const STATIC_MAP_HEIGHT = 504;
const MAX_STATIC_MAP_LOCATIONS = 500;
const STATIC_MAP_FIT_PADDING = 12;
const STATIC_MAP_ROUTE_WIDTH = 2;
const STATIC_MAP_MARKER_WIDTH = 28;
const STATIC_MAP_MARKER_HEIGHT = 32;
const STATIC_MAP_TILE_SIZE = 256;
const STATIC_MAP_WEBP_QUALITY = 84;
const STATIC_MAP_WEBP_EFFORT = 4;
const STATIC_MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const STATIC_MAP_TILE_USER_AGENT = 'Runich/1.0 (static map renderer)';
const STATIC_MAP_TILE_TIMEOUT_MS = 7_000;
const STATIC_MAP_RENDER_TIMEOUT_MS = 15_000;
const STATIC_MAP_TILE_REQUEST_LIMIT = 4;
const STATIC_MAP_MIN_ZOOM = 1;
const STATIC_MAP_MAX_ZOOM = 19;
const STATIC_MAP_MAX_CONCURRENCY = 2;
const STATIC_MAP_FAILURE_THRESHOLD = 5;
const STATIC_MAP_FAILURE_COOLDOWN_MS = 60_000;
const STATIC_MAP_TILE_HEALTH_CACHE_MS = 60_000;
const STATIC_MAP_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const STATIC_MAP_ATTRIBUTION = '© OpenStreetMap contributors';
const STATIC_MAP_START_MARKER = join(process.cwd(), 'assets/maps/start-marker.svg');
const STATIC_MAP_FINISH_MARKER = join(process.cwd(), 'assets/maps/finish-marker.svg');

export type GeneratedActivityMap = {
  url: string;
  key?: string;
};

type GenerateActivityMapInput = {
  userId: string;
  activityId?: string;
  locations: LocationObject[];
};

type StaticMapTile = {
  url: string;
  box: [number, number, number, number];
};

type StaticMapTileResult =
  | { success: true; tile: { url: string; box: StaticMapTile['box']; body: Buffer } }
  | { success: false; error: unknown };

type StaticMapsWithTileFetcher = StaticMaps & {
  getTile: (tile: StaticMapTile) => Promise<StaticMapTileResult>;
};

@Injectable()
export class StaticMapService {
  private readonly logger = new Logger(StaticMapService.name);
  private activeRenders = 0;
  private readonly renderWaiters: Array<() => void> = [];
  private staticMapsFailures = 0;
  private staticMapsBlockedUntil = 0;
  private tileProviderHealthyUntil = 0;
  private healthyTileProviderUrl = '';

  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  async generateActivityMap(input: GenerateActivityMapInput): Promise<GeneratedActivityMap | null> {
    const locations = normalizeStaticMapLocations(input.locations);
    if (!locations.length) return null;

    try {
      const staticMap = await this.renderAndUploadStaticMap(input.userId, input.activityId, locations);
      this.resetStaticMapsFailures();
      return staticMap;
    } catch (error) {
      this.registerStaticMapsFailure(error);
    }

    try {
      return { url: getMapBoxImage(locations) };
    } catch (error) {
      this.logger.error(
        `Не удалось сформировать карту ни через staticmaps, ни через Mapbox: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  private async renderAndUploadStaticMap(
    userId: string,
    activityId: string | undefined,
    locations: LocationObject[],
  ): Promise<GeneratedActivityMap> {
    if (!activityId) throw new Error('Для сохранения static map нужен activityId');

    if (Date.now() < this.staticMapsBlockedUntil) {
      throw new Error('Источник тайлов static map временно отключён после серии ошибок');
    }

    const tileUrl = STATIC_MAP_TILE_URL;
    const tileRequestTimeout = STATIC_MAP_TILE_TIMEOUT_MS;
    const tileRequestHeader = {
      'user-agent': STATIC_MAP_TILE_USER_AGENT,
    };
    await this.ensureTileProvider(tileUrl, tileRequestHeader, tileRequestTimeout);

    const release = await this.acquireRenderSlot();
    try {
      let tileFetchAttempted = false;
      let successfulTileCount = 0;
      const route = locations.map(({ coords }) => [coords.longitude, coords.latitude] as [number, number]);
      const fit = calculateStaticMapFit(route);
      const renderZoom = Math.ceil(fit.zoom);
      const renderScale = 2 ** (renderZoom - fit.zoom);
      const renderMarkerWidth = STATIC_MAP_MARKER_WIDTH * renderScale;
      const renderMarkerHeight = STATIC_MAP_MARKER_HEIGHT * renderScale;
      const map = new StaticMaps({
        width: Math.ceil(STATIC_MAP_WIDTH * renderScale),
        height: Math.ceil(STATIC_MAP_HEIGHT * renderScale),
        paddingX: 0,
        paddingY: 0,
        tileUrl,
        tileRequestTimeout,
        tileRequestHeader,
        tileRequestLimit: STATIC_MAP_TILE_REQUEST_LIMIT,
        zoomRange: { min: STATIC_MAP_MIN_ZOOM, max: STATIC_MAP_MAX_ZOOM },
      }) as StaticMapsWithTileFetcher;
      map.getTile = async (tile) => {
        tileFetchAttempted = true;
        const result = await fetchStaticMapTile(tile, tileRequestHeader, tileRequestTimeout);
        if (result.success) successfulTileCount += 1;
        return result;
      };

      map.addLine({ coords: route, color: '#F66767', width: STATIC_MAP_ROUTE_WIDTH * renderScale });
      map.addMarker({
        coord: route[0],
        img: STATIC_MAP_START_MARKER,
        width: renderMarkerWidth,
        height: renderMarkerHeight,
        drawWidth: getMarkerDrawSize(renderMarkerWidth),
        drawHeight: getMarkerDrawSize(renderMarkerHeight),
        resizeMode: 'contain',
      });
      map.addMarker({
        coord: route.at(-1) ?? route[0],
        img: STATIC_MAP_FINISH_MARKER,
        width: renderMarkerWidth,
        height: renderMarkerHeight,
        drawWidth: getMarkerDrawSize(renderMarkerWidth),
        drawHeight: getMarkerDrawSize(renderMarkerHeight),
        resizeMode: 'contain',
      });

      await withTimeout(
        map.render(fit.center, renderZoom),
        STATIC_MAP_RENDER_TIMEOUT_MS,
        'Превышено время генерации static map',
      );
      if (tileFetchAttempted && !successfulTileCount) throw new Error('Не удалось загрузить тайлы static map');

      const renderedPng = await map.image.buffer('png');
      const resizedPng = await sharp(renderedPng)
        .resize(STATIC_MAP_WIDTH, STATIC_MAP_HEIGHT, { fit: 'fill' })
        .png()
        .toBuffer();
      const image = await addAttribution(resizedPng);
      await validateStaticMap(image);

      const key = getActivityMapKey(userId, activityId);
      const uploaded = await this.storageService.uploadObject(key, image, 'image/webp', STATIC_MAP_CACHE_CONTROL);
      return { url: uploaded.url, key: uploaded.key };
    } finally {
      release();
    }
  }

  private async acquireRenderSlot() {
    if (this.activeRenders < STATIC_MAP_MAX_CONCURRENCY) {
      this.activeRenders += 1;
      return () => this.releaseRenderSlot();
    }

    await new Promise<void>((resolve) => this.renderWaiters.push(resolve));
    this.activeRenders += 1;
    return () => this.releaseRenderSlot();
  }

  private releaseRenderSlot() {
    this.activeRenders -= 1;
    this.renderWaiters.shift()?.();
  }

  private registerStaticMapsFailure(error: unknown) {
    this.staticMapsFailures += 1;
    if (this.staticMapsFailures >= STATIC_MAP_FAILURE_THRESHOLD) {
      this.staticMapsBlockedUntil = Date.now() + STATIC_MAP_FAILURE_COOLDOWN_MS;
    }
    this.logger.warn(`Static map недоступен, использую fallback Mapbox: ${getErrorMessage(error)}`);
  }

  private resetStaticMapsFailures() {
    this.staticMapsFailures = 0;
    this.staticMapsBlockedUntil = 0;
  }

  private async ensureTileProvider(tileUrl: string, headers: Record<string, string>, timeoutMs: number) {
    if (this.healthyTileProviderUrl === tileUrl && Date.now() < this.tileProviderHealthyUntil) return;

    const healthUrl = tileUrl
      .replace('{z}', '0')
      .replace('{x}', '0')
      .replace('{y}', '0')
      .replace('{quadkey}', '0')
      .replace('{s}', 'a');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(healthUrl, { headers, signal: controller.signal });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.toLowerCase().startsWith('image/')) {
        throw new Error(`Tile provider вернул HTTP ${response.status} и тип ${contentType || 'unknown'}`);
      }
      await response.arrayBuffer();
      this.healthyTileProviderUrl = tileUrl;
      this.tileProviderHealthyUntil = Date.now() + STATIC_MAP_TILE_HEALTH_CACHE_MS;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function fetchStaticMapTile(
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

type StaticMapWorldPoint = { x: number; y: number };

export function calculateStaticMapFit(route: [number, number][]) {
  let minZoom = STATIC_MAP_MIN_ZOOM;
  let maxZoom = STATIC_MAP_MAX_ZOOM;

  for (let iteration = 0; iteration < 40; iteration += 1) {
    const zoom = (minZoom + maxZoom) / 2;
    if (isStaticMapFit(route, zoom)) minZoom = zoom;
    else maxZoom = zoom;
  }

  const bounds = getStaticMapBounds(route, minZoom);
  return {
    zoom: minZoom,
    center: unprojectStaticMapPoint((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, minZoom),
  } as const;
}

function isStaticMapFit(route: [number, number][], zoom: number) {
  const bounds = getStaticMapBounds(route, zoom);
  return (
    bounds.maxX - bounds.minX + STATIC_MAP_FIT_PADDING * 2 <= STATIC_MAP_WIDTH &&
    bounds.maxY - bounds.minY + STATIC_MAP_FIT_PADDING * 2 <= STATIC_MAP_HEIGHT
  );
}

function getStaticMapBounds(route: [number, number][], zoom: number) {
  const projectedRoute = route.map(([longitude, latitude]) => projectStaticMapPoint(longitude, latitude, zoom));
  let minX = Math.min(...projectedRoute.map(({ x }) => x));
  let maxX = Math.max(...projectedRoute.map(({ x }) => x));
  let minY = Math.min(...projectedRoute.map(({ y }) => y));
  let maxY = Math.max(...projectedRoute.map(({ y }) => y));

  const lastPoint = route.at(-1) ?? route[0];
  for (const [longitude, latitude] of [route[0], lastPoint]) {
    const { x, y } = projectStaticMapPoint(longitude, latitude, zoom);
    minX = Math.min(minX, x - STATIC_MAP_MARKER_WIDTH / 2);
    maxX = Math.max(maxX, x + STATIC_MAP_MARKER_WIDTH / 2);
    minY = Math.min(minY, y - STATIC_MAP_MARKER_HEIGHT);
    maxY = Math.max(maxY, y);
  }

  return { minX, maxX, minY, maxY };
}

function projectStaticMapPoint(longitude: number, latitude: number, zoom: number): StaticMapWorldPoint {
  const worldSize = STATIC_MAP_TILE_SIZE * 2 ** zoom;
  const safeLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const latitudeRadians = (safeLatitude * Math.PI) / 180;

  return {
    x: ((longitude + 180) / 360) * worldSize,
    y: ((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) * worldSize,
  };
}

function unprojectStaticMapPoint(x: number, y: number, zoom: number): [number, number] {
  const worldSize = STATIC_MAP_TILE_SIZE * 2 ** zoom;

  return [(x / worldSize) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldSize))) / Math.PI) * 180];
}

function getMarkerDrawSize(size: number) {
  return Math.max(1, Math.round(size) - 1);
}

async function addAttribution(input: Buffer) {
  const attribution = STATIC_MAP_ATTRIBUTION;

  const fontSize = 11;
  const boxWidth = Math.max(150, attribution.length * 6 + 16);
  const boxHeight = 19;
  const overlay = Buffer.from(
    `<svg width="${STATIC_MAP_WIDTH}" height="${STATIC_MAP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${STATIC_MAP_WIDTH - boxWidth - 6}" y="${STATIC_MAP_HEIGHT - boxHeight - 6}" width="${boxWidth}" height="${boxHeight}" rx="3" fill="#FFFFFFCC"/>` +
      `<text x="${STATIC_MAP_WIDTH - 14}" y="${STATIC_MAP_HEIGHT - 13}" text-anchor="end" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#222">${escapeXml(attribution)}</text>` +
      '</svg>',
  );

  return await sharp(input)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .webp({ quality: STATIC_MAP_WEBP_QUALITY, effort: STATIC_MAP_WEBP_EFFORT, smartSubsample: true })
    .toBuffer();
}

async function validateStaticMap(input: Buffer) {
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => {
    const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
    return entities[character];
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
