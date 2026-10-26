import { Inject, Injectable, Logger } from '@nestjs/common';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { getActivityMapKey, getActivityRouteOnlyMapKey } from 'src/storage/storage-key';
import { StorageService } from 'src/storage/services/storage.service';
import { STATIC_MAP_CACHE_CONTROL, STATIC_MAP_MAX_CONCURRENCY } from './static-map.constants';
import { renderRunichVectorMap } from './static-map.vector';
import { renderRouteOnlyMap } from './static-map.route-only';
import type { GenerateActivityMapInput, GeneratedActivityMap } from './static-map.types';
import {
  calculateStaticMapViewport,
  getErrorMessage,
  normalizeStaticMapLocations,
  validateStaticMap,
} from './static-map.utils';

@Injectable()
export class StaticMapService {
  private readonly logger = new Logger(StaticMapService.name);
  private activeRenders = 0;
  private readonly renderWaiters: Array<() => void> = [];

  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  async generateActivityMap(input: GenerateActivityMapInput): Promise<GeneratedActivityMap | null> {
    const locations = normalizeStaticMapLocations(input.locations);
    if (!locations.length) return null;

    if (input.hideMap) {
      try {
        return await this.renderAndUploadRouteOnlyMap(input.userId, input.activityId, locations);
      } catch (error) {
        this.logger.error('Не удалось сформировать карту без подложки: ' + getErrorMessage(error));
        return null;
      }
    }

    try {
      return await this.renderAndUploadVectorMap(input.userId, input.activityId, locations);
    } catch (error) {
      this.logger.warn(`Vector static map недоступен, использую fallback Mapbox: ${getErrorMessage(error)}`);
    }

    try {
      return { url: getMapBoxImage(locations) };
    } catch (error) {
      this.logger.error(`Не удалось сформировать карту через vector и Mapbox: ${getErrorMessage(error)}`);
      return null;
    }
  }

  private async renderAndUploadRouteOnlyMap(
    userId: string,
    activityId: string | undefined,
    locations: GenerateActivityMapInput['locations'],
  ): Promise<GeneratedActivityMap> {
    if (!activityId) throw new Error('Для сохранения route-only static map нужен activityId');

    const release = await this.acquireRenderSlot();
    try {
      const renderedImage = await renderRouteOnlyMap(locations);
      await validateStaticMap(renderedImage);
      const key = getActivityRouteOnlyMapKey(userId, activityId);
      const uploaded = await this.storageService.uploadObject(
        key,
        renderedImage,
        'image/webp',
        STATIC_MAP_CACHE_CONTROL,
      );
      return { url: uploaded.url, key: uploaded.key };
    } finally {
      release();
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
      await validateStaticMap(renderedImage);

      const key = getActivityMapKey(userId, activityId);
      const uploaded = await this.storageService.uploadObject(
        key,
        renderedImage,
        'image/webp',
        STATIC_MAP_CACHE_CONTROL,
      );
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
}
