import { Inject, Injectable, Logger } from '@nestjs/common';
import StaticMaps from 'staticmaps';
import { getAppEnvironment } from 'src/common/config/environment';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { getActivityMapKey } from 'src/storage/storage-key';
import { StorageService } from 'src/storage/storage.service';
import {
  STATIC_MAP_CACHE_CONTROL,
  STATIC_MAP_FAILURE_COOLDOWN_MS,
  STATIC_MAP_FAILURE_THRESHOLD,
  STATIC_MAP_HEIGHT,
  STATIC_MAP_MAX_CONCURRENCY,
  STATIC_MAP_MAX_ZOOM,
  STATIC_MAP_MIN_ZOOM,
  STATIC_MAP_RENDER_TIMEOUT_MS,
  STATIC_MAP_ROUTE_WIDTH,
  STATIC_MAP_TILE_HEALTH_CACHE_MS,
  STATIC_MAP_TILE_HEADERS,
  STATIC_MAP_TILE_REQUEST_LIMIT,
  STATIC_MAP_TILE_TIMEOUT_MS,
  STATIC_MAP_TILE_URL,
  STATIC_MAP_WIDTH,
} from './static-map.constants';
import { renderRunichVectorMap } from './static-map.vector';
import type { GenerateActivityMapInput, GeneratedActivityMap, StaticMapsWithTileFetcher } from './static-map.types';
import {
  addAttribution,
  calculateStaticMapViewport,
  cropStaticMapToViewport,
  fetchStaticMapTile,
  getErrorMessage,
  normalizeStaticMapLocations,
  validateStaticMap,
  withTimeout,
} from './static-map.utils';

type TemporaryMapProvider = 'vector' | 'staticmaps' | 'mapbox';

const TEMPORARY_MAP_PROVIDER_ROTATION: TemporaryMapProvider[] = ['vector', 'staticmaps', 'mapbox'];

@Injectable()
export class StaticMapService {
  private readonly logger = new Logger(StaticMapService.name);
  private activeRenders = 0;
  private readonly renderWaiters: Array<() => void> = [];
  private staticMapsFailures = 0;
  private staticMapsBlockedUntil = 0;
  private tileProviderHealthyUntil = 0;
  private healthyTileProviderUrl = '';
  private temporaryMapProviderIndex = 0;

  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  async generateActivityMap(input: GenerateActivityMapInput): Promise<GeneratedActivityMap | null> {
    const locations = normalizeStaticMapLocations(input.locations);
    if (!locations.length) return null;

    const temporaryProvider = this.getTemporaryMapProvider();
    if (temporaryProvider) {
      return this.generateTemporaryProviderMap(temporaryProvider, input, locations);
    }

    try {
      const staticMap = await this.renderAndUploadVectorMap(input.userId, input.activityId, locations);
      this.resetStaticMapsFailures();
      return staticMap;
    } catch (error) {
      this.logger.warn(`Vector static map недоступен, использую raster fallback: ${getErrorMessage(error)}`);
    }

    try {
      const staticMap = await this.renderAndUploadRasterStaticMap(input.userId, input.activityId, locations);
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

  private getTemporaryMapProvider(): TemporaryMapProvider | undefined {
    // Temporary comparison mode: remove this block after the map provider comparison.
    const isTestRuntime = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    if (
      (isTestRuntime && process.env.STATIC_MAP_TEST_PROVIDER_ROTATION !== 'true') ||
      getAppEnvironment() === 'production'
    ) {
      return undefined;
    }

    const provider =
      TEMPORARY_MAP_PROVIDER_ROTATION[this.temporaryMapProviderIndex % TEMPORARY_MAP_PROVIDER_ROTATION.length];
    this.temporaryMapProviderIndex += 1;
    return provider;
  }

  private async generateTemporaryProviderMap(
    provider: TemporaryMapProvider,
    input: GenerateActivityMapInput,
    locations: GenerateActivityMapInput['locations'],
  ): Promise<GeneratedActivityMap | null> {
    try {
      this.logger.log(`Временное сравнение static map: provider=${provider}`);

      if (provider === 'vector') {
        return await this.renderAndUploadVectorMap(input.userId, input.activityId, locations);
      }

      if (provider === 'staticmaps') {
        return await this.renderAndUploadRasterStaticMap(input.userId, input.activityId, locations);
      }

      return { url: getMapBoxImage(locations) };
    } catch (error) {
      this.logger.warn(`Временный provider ${provider} не смог сформировать карту: ${getErrorMessage(error)}`);
      return null;
    }
  }

  private async renderAndUploadVectorMap(
    userId: string,
    activityId: string | undefined,
    locations: GenerateActivityMapInput['locations'],
  ): Promise<GeneratedActivityMap> {
    if (!activityId) throw new Error('Для сохранения vector static map нужен activityId');

    const release = await this.acquireRenderSlot();
    try {
      const route = locations.map(({ coords }) => [coords.longitude, coords.latitude] as [number, number]);
      const viewport = calculateStaticMapViewport(route);
      const renderedImage = await renderRunichVectorMap(route, viewport.center, viewport.zoom);
      const image = await addAttribution(renderedImage);
      await validateStaticMap(image);

      const key = getActivityMapKey(userId, activityId);
      const uploaded = await this.storageService.uploadObject(key, image, 'image/webp', STATIC_MAP_CACHE_CONTROL);
      return { url: uploaded.url, key: uploaded.key };
    } finally {
      release();
    }
  }

  private async renderAndUploadRasterStaticMap(
    userId: string,
    activityId: string | undefined,
    locations: GenerateActivityMapInput['locations'],
  ): Promise<GeneratedActivityMap> {
    if (!activityId) throw new Error('Для сохранения static map нужен activityId');

    if (Date.now() < this.staticMapsBlockedUntil) {
      throw new Error('Источник тайлов static map временно отключён после серии ошибок');
    }

    await this.ensureTileProvider(STATIC_MAP_TILE_URL, STATIC_MAP_TILE_HEADERS, STATIC_MAP_TILE_TIMEOUT_MS);

    const release = await this.acquireRenderSlot();
    try {
      let tileFetchAttempted = false;
      let successfulTileCount = 0;
      const route = locations.map(({ coords }) => [coords.longitude, coords.latitude] as [number, number]);
      const viewport = calculateStaticMapViewport(route);
      const map = new StaticMaps({
        width: STATIC_MAP_WIDTH,
        height: STATIC_MAP_HEIGHT,
        paddingX: 0,
        paddingY: 0,
        tileUrl: STATIC_MAP_TILE_URL,
        tileRequestTimeout: STATIC_MAP_TILE_TIMEOUT_MS,
        tileRequestHeader: STATIC_MAP_TILE_HEADERS,
        tileRequestLimit: STATIC_MAP_TILE_REQUEST_LIMIT,
        zoomRange: { min: STATIC_MAP_MIN_ZOOM, max: STATIC_MAP_MAX_ZOOM },
      }) as StaticMapsWithTileFetcher;
      map.getTile = async (tile) => {
        tileFetchAttempted = true;
        const result = await fetchStaticMapTile(tile, STATIC_MAP_TILE_HEADERS, STATIC_MAP_TILE_TIMEOUT_MS);
        if (result.success) successfulTileCount += 1;
        return result;
      };

      map.addLine({ coords: route, color: '#F66767', width: STATIC_MAP_ROUTE_WIDTH / viewport.scale });

      await withTimeout(
        map.render(viewport.center, viewport.tileZoom),
        STATIC_MAP_RENDER_TIMEOUT_MS,
        'Превышено время генерации static map',
      );
      if (tileFetchAttempted && !successfulTileCount) throw new Error('Не удалось загрузить тайлы static map');

      const renderedImage = (map.image as unknown as { image?: Buffer }).image;
      if (!renderedImage) throw new Error('Static map не вернул внутренний буфер изображения');
      const viewportImage = await cropStaticMapToViewport(renderedImage, viewport);
      const image = await addAttribution(viewportImage);
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
