import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ACTIVITY_MIGRATION_CONFIG } from 'src/activity/shared/const';
import { EmailNotificationService } from './email-notification.service';
import { MAX_ATTEMPTS, MAX_RETRY_DELAY_MS, STALE_JOB_AGE_MS } from './email-notification-worker.constants';
import { EMAIL_NOTIFICATION_JOB_STATUS } from './email-notification.constants';
import { EmailNotificationResolver } from './email-notification.resolver';
import { StorageService } from 'src/storage/services/storage.service';
import type { RepositoryWhere } from 'src/infrastructure/database/prisma/database-repository.metadata';

@Injectable()
export class EmailNotificationWorkerService {
  private readonly logger = new Logger(EmailNotificationWorkerService.name);
  private readonly pollIntervalMs = ACTIVITY_MIGRATION_CONFIG.workerPollIntervalMs;
  private stopRequested = false;
  private readonly resolver: EmailNotificationResolver;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailNotificationService) private readonly notifications: EmailNotificationService,
    @Optional() @Inject(StorageService) private readonly storage?: StorageService,
  ) {
    this.resolver = new EmailNotificationResolver(this.prisma, this.notifications, this.storage);
  }

  requestStop() {
    this.stopRequested = true;
  }

  async processNextJob() {
    const job = await this.prisma.emailNotificationJob.findFirst({
      where: { status: EMAIL_NOTIFICATION_JOB_STATUS.queued, availableAt: { lte: new Date() } },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!job) return false;

    const claimed = await this.prisma.emailNotificationJob.updateMany({
      where: { id: job.id, status: EMAIL_NOTIFICATION_JOB_STATUS.queued },
      data: {
        status: EMAIL_NOTIFICATION_JOB_STATUS.processing,
        attempts: job.attempts + 1,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
    });
    if (claimed.count === 0) return true;

    const attempts = job.attempts + 1;
    try {
      const notification = await this.resolver.resolve(job);
      if (!notification) {
        await this.prisma.emailNotificationJob.update({
          where: { id: job.id },
          data: { status: EMAIL_NOTIFICATION_JOB_STATUS.skipped, finishedAt: new Date(), startedAt: null },
        });
        return true;
      }

      await notification.send();
      await this.prisma.emailNotificationJob.update({
        where: { id: job.id },
        data: { status: EMAIL_NOTIFICATION_JOB_STATUS.sent, finishedAt: new Date(), startedAt: null },
      });
    } catch (error) {
      await this.scheduleRetry(job.id, attempts, error);
    }

    return true;
  }

  async runWorker() {
    this.stopRequested = false;
    await this.requeueInterruptedJobs();
    this.logger.log(`Worker email-уведомлений запущен: poll=${this.pollIntervalMs}ms`);

    while (!this.stopRequested) {
      try {
        const foundJob = await this.processNextJob();
        if (!foundJob) await delay(this.pollIntervalMs);
      } catch (error) {
        this.logger.error('Ошибка цикла worker email-уведомлений', this.getErrorMessage(error));
        await delay(this.pollIntervalMs);
      }
    }

    this.logger.log('Worker email-уведомлений остановлен');
  }

  private async scheduleRetry(jobId: string, attempts: number, error: unknown) {
    const finished = attempts >= MAX_ATTEMPTS;
    const retryDelay = Math.min(30_000 * 2 ** (attempts - 1), MAX_RETRY_DELAY_MS);
    const errorMessage = this.getErrorMessage(error).slice(0, 1000);
    await this.prisma.emailNotificationJob.update({
      where: { id: jobId },
      data: {
        status: finished ? EMAIL_NOTIFICATION_JOB_STATUS.failed : EMAIL_NOTIFICATION_JOB_STATUS.queued,
        availableAt: finished ? new Date() : new Date(Date.now() + retryDelay),
        startedAt: null,
        finishedAt: finished ? new Date() : null,
        errorMessage,
      },
    });
    this.logger.error(
      finished ? `Email notification job ${jobId} failed permanently` : `Email notification job ${jobId} will retry`,
      errorMessage,
    );
  }

  private async requeueInterruptedJobs() {
    const staleJobWhere: RepositoryWhere<'EmailNotificationJob'> = {
      status: EMAIL_NOTIFICATION_JOB_STATUS.processing,
      startedAt: { lt: new Date(Date.now() - STALE_JOB_AGE_MS) },
    };
    await this.prisma.emailNotificationJob.updateMany({
      where: staleJobWhere,
      data: {
        status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
        startedAt: null,
        finishedAt: null,
        availableAt: new Date(),
        errorMessage: 'Worker перезапущен во время отправки',
      },
    });
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
