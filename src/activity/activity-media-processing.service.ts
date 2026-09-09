import { Inject, Injectable, Logger } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { blurhashFromUrl } from 'src/common/images/blurhash';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import {
  ACTIVITY_MEDIA_PROCESSING_CONFIG,
  ACTIVITY_MEDIA_PROCESSING_STATUS,
} from './activity-media-processing.constants';
import { getMediaProcessingErrorMessage, hasBlurhash, isPhotoVideoObject } from './activity-media-processing.utils';
import type { ActivityMediaProcessingRecord } from './type';

@Injectable()
export class ActivityMediaProcessingService {
  private readonly logger = new Logger(ActivityMediaProcessingService.name);
  private readonly batchSize = ACTIVITY_MEDIA_PROCESSING_CONFIG.batchSize;
  private readonly pollIntervalMs = ACTIVITY_MEDIA_PROCESSING_CONFIG.workerPollIntervalMs;
  private stopRequested = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService,
  ) {}

  requestStop() {
    this.stopRequested = true;
  }

  async processNextBatch() {
    const activities = await this.prisma.activity.findMany({
      where: { mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: this.batchSize,
      select: {
        id: true,
        photoVideoUrls: true,
        mapPhotoUrl: true,
        mapPhotoUrlBlurhash: true,
      },
    });
    if (!activities.length) return false;

    for (const activity of activities as ActivityMediaProcessingRecord[]) {
      await this.processActivity(activity);
    }
    return true;
  }

  async runWorker() {
    this.stopRequested = false;
    await this.requeueInterruptedActivities();
    this.logger.log(`Worker обработки медиа запущен: batch=${this.batchSize}, poll=${this.pollIntervalMs}ms`);

    while (!this.stopRequested) {
      try {
        const foundActivities = await this.processNextBatch();
        if (!foundActivities) await delay(this.pollIntervalMs);
      } catch (error) {
        this.logger.error('Ошибка цикла worker обработки медиа', getMediaProcessingErrorMessage(error));
        await delay(this.pollIntervalMs);
      }
    }

    this.logger.log('Worker обработки медиа остановлен');
  }

  private async processActivity(activity: ActivityMediaProcessingRecord) {
    const claimed = await this.prisma.activity.updateMany({
      where: {
        id: activity.id,
        mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued,
      },
      data: { mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.processing },
    });
    if (claimed.count === 0) return;

    try {
      const data: Record<string, unknown> = {
        mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.completed,
      };
      const photos = Array.isArray(activity.photoVideoUrls) ? activity.photoVideoUrls : null;

      if (photos?.some((photo) => isPhotoVideoObject(photo) && !hasBlurhash(photo))) {
        data.photoVideoUrls = await Promise.all(
          photos.map(async (photo) => {
            if (!isPhotoVideoObject(photo) || hasBlurhash(photo)) return photo;

            return {
              ...photo,
              blurhash: await blurhashFromUrl(photo.thumbnail || photo.url, this.latencyMetrics),
            };
          }),
        );
      }

      if (activity.mapPhotoUrl && !activity.mapPhotoUrlBlurhash) {
        data.mapPhotoUrlBlurhash = await blurhashFromUrl(activity.mapPhotoUrl, this.latencyMetrics);
      }

      await this.prisma.activity.update({ where: { id: activity.id }, data });
    } catch (error) {
      await this.prisma.activity.updateMany({
        where: {
          id: activity.id,
          mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.processing,
        },
        data: { mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued },
      });
      this.logger.error(`Не удалось обработать медиа активности ${activity.id}`, getMediaProcessingErrorMessage(error));
    }
  }

  private async requeueInterruptedActivities() {
    await this.prisma.activity.updateMany({
      where: { mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.processing },
      data: { mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued },
    });
  }
}
