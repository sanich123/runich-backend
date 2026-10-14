import { Inject, Injectable, Logger } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { ACTIVITY_MIGRATION_CONFIG } from 'src/activity/activity-migration-config';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import {
  PUSH_NOTIFICATION_COPY,
  PUSH_NOTIFICATION_JOB_STATUS,
  PUSH_NOTIFICATION_WORKER_CONFIG,
} from './notification.constants';
import {
  getNotificationActorName,
  getNotificationErrorMessage,
  getPushNotificationBody,
  getPushNotificationTitle,
} from './notification.helpers';
import { PushNotificationService } from './push-notification.service';
import type { ExpoPushMessage } from './notification.types';

@Injectable()
export class PushNotificationWorkerService {
  private readonly logger = new Logger(PushNotificationWorkerService.name);
  private readonly pollIntervalMs = ACTIVITY_MIGRATION_CONFIG.workerPollIntervalMs;
  private stopRequested = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PushNotificationService) private readonly push: PushNotificationService,
  ) {}

  requestStop() {
    this.stopRequested = true;
  }

  async processNextJob() {
    const job = await this.prisma.pushNotificationJob.findFirst({
      where: { status: PUSH_NOTIFICATION_JOB_STATUS.queued, availableAt: { lte: new Date() } },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!job) return false;

    const attempts = job.attempts + 1;
    const claimed = await this.prisma.pushNotificationJob.updateMany({
      where: { id: job.id, status: PUSH_NOTIFICATION_JOB_STATUS.queued },
      data: {
        status: PUSH_NOTIFICATION_JOB_STATUS.processing,
        attempts,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
    });
    if (claimed.count === 0) return true;

    try {
      const notification = await this.prisma.notification.findUnique({
        where: { id: job.notificationId },
        select: {
          id: true,
          recipientUserId: true,
          type: true,
          targetType: true,
          targetId: true,
          relatedId: true,
          actorName: true,
          actorSurname: true,
          content: true,
          recipient: { select: { profile: { select: { pushNotifications: true } } } },
        },
      });
      if (!notification || notification.recipient.profile?.pushNotifications !== true) {
        await this.finish(job.id, PUSH_NOTIFICATION_JOB_STATUS.skipped);
        return true;
      }

      const devices: { id: string; token: string }[] = await this.prisma.pushDeviceToken.findMany({
        where: { userId: notification.recipientUserId, active: true },
        select: { id: true, token: true },
      });
      if (devices.length === 0) {
        await this.finish(job.id, PUSH_NOTIFICATION_JOB_STATUS.skipped);
        return true;
      }

      const actorName = getNotificationActorName(notification.actorName, notification.actorSurname);
      const title = getPushNotificationTitle(notification.type, actorName);
      const body = getPushNotificationBody(notification.type, notification.content);
      for (let offset = 0; offset < devices.length; offset += PUSH_NOTIFICATION_WORKER_CONFIG.batchSize) {
        const batch = devices.slice(offset, offset + PUSH_NOTIFICATION_WORKER_CONFIG.batchSize);
        const messages: ExpoPushMessage[] = batch.map(({ token }) => ({
          to: token,
          title,
          body,
          data: {
            notificationId: notification.id,
            targetType: notification.targetType,
            targetId: notification.targetId,
            relatedId: notification.relatedId,
          },
          sound: 'default',
          priority: 'high',
          channelId: 'default',
        }));
        const tickets = await this.push.send(messages);
        const invalidDeviceIds = batch
          .filter((_, index) => tickets[index]?.details?.error === 'DeviceNotRegistered')
          .map(({ id }) => id);
        if (invalidDeviceIds.length) {
          await this.prisma.pushDeviceToken.updateMany({
            where: { id: { in: invalidDeviceIds } },
            data: { active: false, updatedAt: new Date() },
          });
        }
        const failed = tickets.find(
          (ticket) => ticket.status === 'error' && ticket.details?.error !== 'DeviceNotRegistered',
        );
        if (failed) throw new Error(failed.message || failed.details?.error || PUSH_NOTIFICATION_COPY.failedTicket);
      }

      await this.finish(job.id, PUSH_NOTIFICATION_JOB_STATUS.sent);
    } catch (error) {
      await this.scheduleRetry(job.id, attempts, error);
    }

    return true;
  }

  async runWorker() {
    this.stopRequested = false;
    await this.requeueInterruptedJobs();
    this.logger.log(`${PUSH_NOTIFICATION_COPY.workerStarted}${this.pollIntervalMs}ms`);
    while (!this.stopRequested) {
      try {
        const foundJob = await this.processNextJob();
        if (!foundJob) await delay(this.pollIntervalMs);
      } catch (error) {
        this.logger.error(PUSH_NOTIFICATION_COPY.workerCycleError, getNotificationErrorMessage(error));
        await delay(this.pollIntervalMs);
      }
    }
    this.logger.log(PUSH_NOTIFICATION_COPY.workerStopped);
  }

  private async finish(jobId: string, status: string) {
    await this.prisma.pushNotificationJob.update({
      where: { id: jobId },
      data: { status, finishedAt: new Date(), startedAt: null },
    });
  }

  private async scheduleRetry(jobId: string, attempts: number, error: unknown) {
    const finished = attempts >= PUSH_NOTIFICATION_WORKER_CONFIG.maxAttempts;
    const retryDelay = Math.min(
      PUSH_NOTIFICATION_WORKER_CONFIG.retryBaseDelayMs * 2 ** (attempts - 1),
      PUSH_NOTIFICATION_WORKER_CONFIG.maxRetryDelayMs,
    );
    const errorMessage = getNotificationErrorMessage(error).slice(0, 1000);
    await this.prisma.pushNotificationJob.update({
      where: { id: jobId },
      data: {
        status: finished ? PUSH_NOTIFICATION_JOB_STATUS.failed : PUSH_NOTIFICATION_JOB_STATUS.queued,
        availableAt: finished ? new Date() : new Date(Date.now() + retryDelay),
        startedAt: null,
        finishedAt: finished ? new Date() : null,
        errorMessage,
      },
    });
    if (finished) this.push.logPermanentFailure(jobId, error);
    else this.logger.error(`${PUSH_NOTIFICATION_COPY.retryScheduled} ${jobId}`, errorMessage);
  }

  private async requeueInterruptedJobs() {
    await this.prisma.pushNotificationJob.updateMany({
      where: {
        status: PUSH_NOTIFICATION_JOB_STATUS.processing,
        startedAt: { lt: new Date(Date.now() - PUSH_NOTIFICATION_WORKER_CONFIG.staleJobAgeMs) },
      },
      data: {
        status: PUSH_NOTIFICATION_JOB_STATUS.queued,
        startedAt: null,
        finishedAt: null,
        availableAt: new Date(),
        errorMessage: PUSH_NOTIFICATION_COPY.interruptedJob,
      },
    });
  }
}
