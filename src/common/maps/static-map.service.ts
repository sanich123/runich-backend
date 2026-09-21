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
const STATIC_MAP_RENDER_WIDTH = 1792;
const STATIC_MAP_RENDER_HEIGHT = 1008;
const MAX_STATIC_MAP_LOCATIONS = 500;
const STATIC_MAP_PADDING_X = 8;
const STATIC_MAP_PADDING_Y = 16;
const STATIC_MAP_ROUTE_WIDTH = 8;
const STATIC_MAP_MARKER_WIDTH = 128;
const STATIC_MAP_MARKER_HEIGHT = 160;
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
      const map = new StaticMaps({
        width: STATIC_MAP_RENDER_WIDTH,
        height: STATIC_MAP_RENDER_HEIGHT,
        paddingX: STATIC_MAP_PADDING_X,
        paddingY: STATIC_MAP_PADDING_Y,
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

      const route = locations.map(({ coords }) => [coords.longitude, coords.latitude] as [number, number]);
      map.addLine({ coords: route, color: '#F66767', width: STATIC_MAP_ROUTE_WIDTH });
      map.addMarker({
        coord: route[0],
        img: STATIC_MAP_START_MARKER,
        width: STATIC_MAP_MARKER_WIDTH,
        height: STATIC_MAP_MARKER_HEIGHT,
        resizeMode: 'contain',
      });
      map.addMarker({
        coord: route.at(-1) ?? route[0],
        img: STATIC_MAP_FINISH_MARKER,
        width: STATIC_MAP_MARKER_WIDTH,
        height: STATIC_MAP_MARKER_HEIGHT,
        resizeMode: 'contain',
      });

      await withTimeout(map.render(), STATIC_MAP_RENDER_TIMEOUT_MS, 'Превышено время генерации static map');
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
