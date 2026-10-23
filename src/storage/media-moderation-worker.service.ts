import { Inject, Injectable, Logger } from '@nestjs/common';
import * as nsfwjs from 'nsfwjs';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { StorageService } from './storage.service';
import {
  MEDIA_MODERATION_MAX_VIDEO_FRAMES,
  MEDIA_MODERATION_MAX_VIDEO_SECONDS,
  MEDIA_MODERATION_MODEL_VERSION,
  MEDIA_MODERATION_RETRY_LIMIT,
  MEDIA_MODERATION_REVIEW_THRESHOLDS,
  MEDIA_MODERATION_STALE_PROCESSING_MS,
  MEDIA_MODERATION_VIDEO_SAMPLE_FPS,
} from './media-moderation-thresholds';

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 2_000;
const MODEL_URL = process.env.NSFWJS_MODEL_URL?.trim();

type MediaAsset = {
  id: string;
  ownerId: string;
  quarantineKey: string;
  contentType: string;
  attempts: number;
};

type Prediction = { className: string; probability: number };

@Injectable()
export class MediaModerationWorkerService {
  private readonly logger = new Logger(MediaModerationWorkerService.name);
  private model: nsfwjs.NSFWJS | undefined;
  private stopRequested = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

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
      const result = await this.scanAsset(asset);
      const scannedAt = new Date();
      const reason = this.getReviewReason(result.scores);
      if (reason) {
        await this.queueForReview(asset, result.scores, result.frameCount, scannedAt, reason);
      } else {
        await this.storage.approveModerationAsset(asset.id);
        await this.prisma.mediaModerationAsset.update({
          where: { id: asset.id },
          data: {
            status: 'approved',
            scores: result.scores,
            frameCount: result.frameCount,
            modelVersion: MEDIA_MODERATION_MODEL_VERSION,
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
      `Worker проверки медиа запущен: poll=${POLL_INTERVAL_MS}ms, model=${MEDIA_MODERATION_MODEL_VERSION}`,
    );

    while (!this.stopRequested) {
      try {
        const foundAsset = await this.processNextAsset();
        if (!foundAsset) await delay(POLL_INTERVAL_MS);
      } catch (error) {
        this.logger.error(
          'Ошибка цикла проверки пользовательского медиа',
          error instanceof Error ? error.stack : String(error),
        );
        await delay(POLL_INTERVAL_MS);
      }
    }
    this.logger.log('Worker проверки медиа остановлен');
  }

  private async scanAsset(asset: MediaAsset) {
    const directory = await mkdtemp(join(tmpdir(), 'runich-media-check-'));
    const inputPath = join(directory, asset.contentType.startsWith('video/') ? 'upload-video' : 'upload-image');
    try {
      await this.storage.downloadQuarantineObjectToFile(asset.quarantineKey, inputPath);
      const model = await this.getModel();
      if (asset.contentType.startsWith('video/')) {
        return await this.scanVideo(model, inputPath, directory);
      }
      return { scores: await this.classify(model, inputPath), frameCount: null };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async scanVideo(model: nsfwjs.NSFWJS, inputPath: string, directory: string) {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
    );
    const durationSeconds = Number(stdout.trim());
    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > MEDIA_MODERATION_MAX_VIDEO_SECONDS
    ) {
      throw new Error(`Длительность видео должна быть не более ${MEDIA_MODERATION_MAX_VIDEO_SECONDS} секунд`);
    }

    const framePattern = join(directory, 'frame-%03d.jpg');
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        inputPath,
        '-vf',
        `fps=${MEDIA_MODERATION_VIDEO_SAMPLE_FPS}`,
        '-frames:v',
        String(MEDIA_MODERATION_MAX_VIDEO_FRAMES),
        framePattern,
      ],
      { timeout: 90_000, maxBuffer: 2 * 1024 * 1024 },
    );
    const frames = (await readdir(directory)).filter((fileName) => /^frame-\d+\.jpg$/.test(fileName)).sort();
    if (!frames.length) throw new Error('Не удалось извлечь кадры видео для проверки');

    const scores: Record<string, number> = {};
    for (const frame of frames) {
      const frameScores = await this.classify(model, join(directory, frame));
      for (const [className, probability] of Object.entries(frameScores)) {
        scores[className] = Math.max(scores[className] ?? 0, probability);
      }
    }
    return { scores, frameCount: frames.length };
  }

  private async classify(model: nsfwjs.NSFWJS, imagePath: string) {
    const { data, info } = await sharp(imagePath)
      .rotate()
      .resize(224, 224, { fit: 'cover' })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, info.channels]);
    try {
      const predictions = (await model.classify(tensor)) as Prediction[];
      return Object.fromEntries(predictions.map(({ className, probability }) => [className, probability]));
    } finally {
      tensor.dispose();
    }
  }

  private async getModel() {
    if (this.model) return this.model;
    await tf.setBackend('cpu');
    await tf.ready();
    this.model = await this.loadModel();
    return this.model;
  }

  private async loadModel() {
    return await nsfwjs.load(MODEL_URL);
  }

  private getReviewReason(scores: Record<string, number>) {
    const matches = Object.entries(MEDIA_MODERATION_REVIEW_THRESHOLDS)
      .filter(([className, threshold]) => (scores[className] ?? 0) >= threshold)
      .sort((first, second) => scores[second[0]]! - scores[first[0]]!);
    if (!matches.length) return null;
    return matches.map(([className]) => `${className}=${scores[className]!.toFixed(2)}`).join(', ');
  }

  private async queueForReview(
    asset: MediaAsset,
    scores: Record<string, number>,
    frameCount: number | null,
    scannedAt: Date,
    reason: string,
    reportReason: 'sexual_content' | 'other' = 'sexual_content',
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
          modelVersion: MEDIA_MODERATION_MODEL_VERSION,
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
          details: `Автоматическая проверка NSFWJS: ${reason}.${frameCount === null ? '' : ` Кадров проверено: ${frameCount}.`} Решение принимает модератор.`,
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
