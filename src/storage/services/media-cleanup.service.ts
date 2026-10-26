import { Inject, Injectable, Logger } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ACTIVITY_MIGRATION_CONFIG } from 'src/activity/activity-migration-config';
import { StorageService } from './storage.service';
import { MEDIA_CLEANUP_STATUS } from '../const';
import type { CleanupDatabase } from '../type';
import { getStorageErrorMessage } from '../utils';

@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);
  private readonly pollIntervalMs = this.getPollInterval();
  private stopRequested = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {}

  async enqueueUserCleanup(userId: string, database: CleanupDatabase = this.prisma) {
    return await database.mediaCleanupJob.create({
      data: { userId, status: MEDIA_CLEANUP_STATUS.queued },
    });
  }

  async enqueueObjectCleanup(userId: string, storageKey: string, database: CleanupDatabase = this.prisma) {
    return await database.mediaCleanupJob.create({
      data: { userId, storageKey, status: MEDIA_CLEANUP_STATUS.queued },
    });
  }

  requestStop() {
    this.stopRequested = true;
  }

  async processNextJob() {
    const job = await this.prisma.mediaCleanupJob.findFirst({
      where: { status: MEDIA_CLEANUP_STATUS.queued },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return false;

    const claimed = await this.prisma.mediaCleanupJob.updateMany({
      where: { id: job.id, status: MEDIA_CLEANUP_STATUS.queued },
      data: { status: MEDIA_CLEANUP_STATUS.processing, startedAt: new Date(), finishedAt: null, errorMessage: null },
    });
    if (claimed.count === 0) return true;

    try {
      if (job.storageKey) await this.storageService.deleteObjectByKey(job.storageKey);
      else await this.storageService.deleteUserFiles(job.userId);
      await this.prisma.mediaCleanupJob.update({
        where: { id: job.id },
        data: { status: MEDIA_CLEANUP_STATUS.completed, finishedAt: new Date(), errorMessage: null },
      });
    } catch (error) {
      const errorMessage = getStorageErrorMessage(error);
      await this.prisma.mediaCleanupJob.update({
        where: { id: job.id },
        data: { status: MEDIA_CLEANUP_STATUS.failed, finishedAt: new Date(), errorMessage },
      });
      this.logger.error(
        job.storageKey
          ? `Не удалось удалить S3-объект ${job.storageKey}`
          : `Не удалось удалить S3-файлы пользователя ${job.userId}`,
        errorMessage,
      );
    }

    return true;
  }

  async runWorker() {
    this.stopRequested = false;
    await this.requeueInterruptedJobs();
    this.logger.log(`Worker очистки S3 запущен: poll=${this.pollIntervalMs}ms`);

    while (!this.stopRequested) {
      try {
        const foundJob = await this.processNextJob();
        if (!foundJob) await delay(this.pollIntervalMs);
      } catch (error) {
        this.logger.error('Ошибка цикла worker очистки S3', getStorageErrorMessage(error));
        await delay(this.pollIntervalMs);
      }
    }

    this.logger.log('Worker очистки S3 остановлен');
  }

  private async requeueInterruptedJobs() {
    await this.prisma.mediaCleanupJob.updateMany({
      where: { status: MEDIA_CLEANUP_STATUS.processing },
      data: { status: MEDIA_CLEANUP_STATUS.queued, startedAt: null, finishedAt: null, errorMessage: null },
    });
  }

  private getPollInterval() {
    return ACTIVITY_MIGRATION_CONFIG.workerPollIntervalMs;
  }
}
