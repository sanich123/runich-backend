import { Inject, Injectable, Logger } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { GoogleCloudVisionSafeSearch } from './google-cloud-vision-safe-search';
import { MediaModerationScannerService } from './media-moderation-scanner.service';
import {
  MEDIA_MODERATION_GOOGLE_VISION_MONTHLY_LIMIT,
  MEDIA_MODERATION_MODEL_VERSION,
  MEDIA_MODERATION_POLL_INTERVAL_MS,
  MEDIA_MODERATION_RETRY_LIMIT,
  MEDIA_MODERATION_STALE_PROCESSING_MS,
} from './media-moderation-thresholds';
import { getMediaModerationProviderName, getMediaModerationReviewReason } from './media-moderation-worker.helpers';
import type { MediaAsset } from './media-moderation-worker.types';
import { StorageService } from './storage.service';

@Injectable()
export class MediaModerationWorkerService {
  private readonly logger = new Logger(MediaModerationWorkerService.name);
  private readonly scanner: MediaModerationScannerService;
  private stopRequested = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {
    this.scanner = new MediaModerationScannerService(this.storage, new GoogleCloudVisionSafeSearch(prisma));
  }

  requestStop() {
    this.stopRequested = true;
  }

  async processNextAsset() {
    const asset = (await this.prisma.mediaModerationAsset.findFirst({
      where: { status: 'queued' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, ownerId: true, quarantineKey: true, contentType: true, attempts: true },
    })) as MediaAsset | null;
    if (!asset) return false;

    const claimed = await this.prisma.mediaModerationAsset.updateMany({
      where: { id: asset.id, status: 'queued' },
      data: { status: 'processing', attempts: asset.attempts + 1, processingStartedAt: new Date() },
    });
    if (!claimed.count) return true;

    try {
      const result = await this.scanner.scan(asset);
      const scannedAt = new Date();
      const reason = getMediaModerationReviewReason(result.scores);
      if (reason) {
        await this.queueForReview(
          asset,
          result.scores,
          result.frameCount,
          scannedAt,
          reason,
          'sexual_content',
          result.modelVersion,
        );
      } else {
        await this.storage.approveModerationAsset(asset.id);
        await this.prisma.mediaModerationAsset.update({
          where: { id: asset.id },
          data: {
            status: 'approved',
            scores: result.scores,
            frameCount: result.frameCount,
            modelVersion: result.modelVersion ?? MEDIA_MODERATION_MODEL_VERSION,
            scannedAt,
            processingStartedAt: null,
          },
        });
      }
    } catch (error) {
      const attempts = asset.attempts + 1;
      const exhausted = attempts >= MEDIA_MODERATION_RETRY_LIMIT;
      if (exhausted) {
        await this.queueForReview(
          asset,
          {},
          null,
          new Date(),
          `Автоматическая проверка завершилась ошибкой после ${attempts} попыток. Требуется ручная проверка.`,
          'other',
        );
      } else {
        await this.prisma.mediaModerationAsset.updateMany({
          where: { id: asset.id, status: 'processing' },
          data: { status: 'queued', processingStartedAt: null },
        });
      }
      this.logger.error(
        `Не удалось проверить media upload ${asset.id}${exhausted ? ' после повторов' : ', будет повторная попытка'}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return true;
  }

  async runWorker() {
    this.stopRequested = false;
    await this.requeueInterruptedAssets();
    this.logger.log(
      `Worker проверки медиа запущен: poll=${MEDIA_MODERATION_POLL_INTERVAL_MS}ms, Google Cloud Vision production limit=${MEDIA_MODERATION_GOOGLE_VISION_MONTHLY_LIMIT}, NSFWJS fallback=${MEDIA_MODERATION_MODEL_VERSION}`,
    );

    while (!this.stopRequested) {
      try {
        const foundAsset = await this.processNextAsset();
        if (!foundAsset) await delay(MEDIA_MODERATION_POLL_INTERVAL_MS);
      } catch (error) {
        this.logger.error(
          'Ошибка цикла проверки пользовательского медиа',
          error instanceof Error ? error.stack : String(error),
        );
        await delay(MEDIA_MODERATION_POLL_INTERVAL_MS);
      }
    }
    this.logger.log('Worker проверки медиа остановлен');
  }

  private async queueForReview(
    asset: MediaAsset,
    scores: Record<string, number>,
    frameCount: number | null,
    scannedAt: Date,
    reason: string,
    reportReason: 'sexual_content' | 'other',
    modelVersion = MEDIA_MODERATION_MODEL_VERSION,
  ) {
    await this.prisma.$transaction(async (transaction) => {
      const report = await transaction.contentReport.findFirst({
        where: { targetType: 'media_upload', targetId: asset.id, status: { in: ['open', 'in_review', 'appealed'] } },
        select: { id: true },
      });
      await transaction.mediaModerationAsset.update({
        where: { id: asset.id },
        data: {
          status: 'review_required',
          scores,
          frameCount,
          modelVersion,
          scannedAt,
          processingStartedAt: null,
        },
      });
      if (report) return;

      const createdReport = await transaction.contentReport.create({
        data: {
          targetType: 'media_upload',
          targetId: asset.id,
          mediaUploadId: asset.id,
          subjectUserId: asset.ownerId,
          reason: reportReason,
          details: `Автоматическая проверка ${getMediaModerationProviderName(modelVersion)}: ${reason}.${frameCount === null ? '' : ` Кадров проверено: ${frameCount}.`} Решение принимает модератор.`,
          priority: 'high',
        },
        select: { id: true },
      });
      await transaction.emailNotificationJob.create({
        data: {
          notificationType: EMAIL_NOTIFICATION_TYPE.moderationReport,
          sourceId: createdReport.id,
          status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
        },
      });
    });
  }

  private async requeueInterruptedAssets() {
    await this.prisma.mediaModerationAsset.updateMany({
      where: {
        status: 'processing',
        processingStartedAt: { lt: new Date(Date.now() - MEDIA_MODERATION_STALE_PROCESSING_MS) },
      },
      data: { status: 'queued', processingStartedAt: null },
    });
  }
}
