import { Inject, Injectable, Logger } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationContentNotificationsService } from './moderation-content-notifications.service';
import { TextModerationLocalClassifierService } from './text-moderation-local-classifier.service';
import {
  ACTIVE_REPORT_STATUSES,
  DEFAULT_TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD,
  TEXT_MODERATION_INFERENCE_METRICS_INTERVAL_MS,
  LOCAL_TEXT_MODERATION_MODEL_VERSION,
  TEXT_MODERATION_POLL_INTERVAL_MS,
  TEXT_MODERATION_STALE_PROCESSING_MS,
  getTextModerationThreshold,
  getLocalReviewReason,
  normalizeModerationText,
} from './text-moderation-worker.utils';
import type { ClassificationResult, TextModerationItem, TextTargetType } from './text-moderation-worker.utils';

@Injectable()
export class TextModerationWorkerService {
  private readonly logger = new Logger(TextModerationWorkerService.name);
  private stopRequested = false;
  private targetCursor = 0;
  private inferenceMetricsWindowStartedAt = performance.now();
  private inferenceCount = 0;
  private inferenceFailureCount = 0;
  private inferenceDurationMs = 0;
  private maxInferenceDurationMs = 0;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TextModerationLocalClassifierService)
    private readonly localClassifier: TextModerationLocalClassifierService,
    @Inject(ModerationContentNotificationsService)
    private readonly contentNotifications: ModerationContentNotificationsService,
  ) {}

  requestStop() {
    this.stopRequested = true;
  }

  async processNextText() {
    this.logInferenceMetricsIfDue();
    const targets: TextTargetType[] = ['comment', 'group_post', 'activity_text'];
    for (let offset = 0; offset < targets.length; offset += 1) {
      const targetType = targets[(this.targetCursor + offset) % targets.length];
      const item = await this.findPendingItem(targetType);
      if (!item) continue;

      this.targetCursor = (this.targetCursor + offset + 1) % targets.length;
      if (!(await this.claim(item))) return true;
      try {
        const result = await this.classify(item.text);
        if (result.needsReview) {
          await this.queueForReview(item, result);
        } else {
          await this.setStatus(item, 'visible');
        }
      } catch (error) {
        await this.queueForReview(item, {
          needsReview: true,
          scores: {},
          modelVersion: 'unavailable',
          reason: `Автоматическая проверка недоступна: ${error instanceof Error ? error.message : 'ошибка ONNX-классификации'}.`,
        });
      }
      return true;
    }
    return false;
  }

  async runWorker() {
    this.stopRequested = false;
    await this.requeueInterruptedItems();
    this.logger.log(
      `Worker премодерации текста запущен: poll=${TEXT_MODERATION_POLL_INTERVAL_MS}ms, model=${LOCAL_TEXT_MODERATION_MODEL_VERSION}`,
    );

    while (!this.stopRequested) {
      try {
        const foundItem = await this.processNextText();
        if (!foundItem) await delay(TEXT_MODERATION_POLL_INTERVAL_MS);
      } catch (error) {
        this.logger.error('Ошибка цикла премодерации текста', error instanceof Error ? error.stack : String(error));
        await delay(TEXT_MODERATION_POLL_INTERVAL_MS);
      }
    }
    this.logger.log('Worker премодерации текста остановлен');
  }

  private async findPendingItem(targetType: TextTargetType): Promise<TextModerationItem | null> {
    if (targetType === 'comment') {
      const comment = await this.prisma.comment.findFirst({
        where: {
          moderationStatus: 'pending',
          contentReports: { none: { targetType: 'comment', status: { in: [...ACTIVE_REPORT_STATUSES] } } },
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        select: { id: true, comment: true, authorId: true },
      });
      return comment ? { id: comment.id, text: comment.comment, ownerId: comment.authorId, targetType } : null;
    }

    if (targetType === 'group_post') {
      const post = await this.prisma.groupPost.findFirst({
        where: {
          moderationStatus: 'pending',
          contentReports: { none: { targetType: 'group_post', status: { in: [...ACTIVE_REPORT_STATUSES] } } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, text: true, createdByUserId: true },
      });
      return post ? { id: post.id, text: post.text, ownerId: post.createdByUserId, targetType } : null;
    }

    const activity = await this.prisma.activity.findFirst({
      where: {
        textModerationStatus: 'pending',
        contentReports: { none: { targetType: 'activity_text', status: { in: [...ACTIVE_REPORT_STATUSES] } } },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, description: true, userId: true },
    });
    if (!activity) return null;
    const text = [activity.title, activity.description]
      .filter((value): value is string => Boolean(value?.trim()))
      .join('\n');
    if (!text) {
      await this.prisma.activity.update({
        where: { id: activity.id },
        data: { textModerationStatus: 'visible', textModerationProcessingStartedAt: null },
      });
      return null;
    }
    return { id: activity.id, text, ownerId: activity.userId, targetType };
  }

  private async claim(item: TextModerationItem) {
    const startedAt = new Date();
    const where = { id: item.id, moderationStatus: 'pending' as const };
    if (item.targetType === 'comment') {
      const result = await this.prisma.comment.updateMany({
        where,
        data: { moderationStatus: 'processing', moderationProcessingStartedAt: startedAt },
      });
      return result.count === 1;
    }
    if (item.targetType === 'group_post') {
      const result = await this.prisma.groupPost.updateMany({
        where,
        data: { moderationStatus: 'processing', moderationProcessingStartedAt: startedAt },
      });
      return result.count === 1;
    }
    const result = await this.prisma.activity.updateMany({
      where: { id: item.id, textModerationStatus: 'pending' },
      data: { textModerationStatus: 'processing', textModerationProcessingStartedAt: startedAt },
    });
    return result.count === 1;
  }

  private async classify(text: string): Promise<ClassificationResult> {
    const normalized = normalizeModerationText(text);
    const localReason = getLocalReviewReason(normalized);
    if (localReason) {
      return {
        needsReview: true,
        scores: { [localReason]: 1 },
        modelVersion: 'local-rules-v1',
        reason: `Локальное правило: ${localReason}. Текст направлен модератору без передачи во внешний сервис.`,
      };
    }

    return this.classifyLocally(normalized);
  }

  private async classifyLocally(text: string): Promise<ClassificationResult> {
    const inferenceStartedAt = performance.now();
    const labels = await this.localClassifier.classify(text).then(
      (result) => {
        this.recordInference(performance.now() - inferenceStartedAt, false);
        return result;
      },
      (error: unknown) => {
        this.recordInference(performance.now() - inferenceStartedAt, true);
        throw error;
      },
    );
    const toxic = labels.find(({ label }) => label === 'toxic');
    if (!toxic) throw new Error('Локальная ONNX-модель не вернула оценку toxic');
    const threshold = getTextModerationThreshold(
      'TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD',
      DEFAULT_TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD,
    );
    return {
      needsReview: toxic.score >= threshold,
      scores: Object.fromEntries(labels.map(({ label, score }) => [label, score])),
      modelVersion: LOCAL_TEXT_MODERATION_MODEL_VERSION,
      reason: `Локальная ONNX оценка toxic=${toxic.score.toFixed(3)}, порог=${threshold.toFixed(3)}.`,
    };
  }

  private recordInference(durationMs: number, failed: boolean) {
    const roundedDurationMs = Math.max(0, Math.round(durationMs));
    this.inferenceCount += 1;
    if (failed) this.inferenceFailureCount += 1;
    this.inferenceDurationMs += roundedDurationMs;
    this.maxInferenceDurationMs = Math.max(this.maxInferenceDurationMs, roundedDurationMs);
  }

  private logInferenceMetricsIfDue() {
    const now = performance.now();
    const windowDurationMs = now - this.inferenceMetricsWindowStartedAt;
    if (windowDurationMs < TEXT_MODERATION_INFERENCE_METRICS_INTERVAL_MS) return;

    const averageDurationMs =
      this.inferenceCount === 0 ? 0 : Math.round(this.inferenceDurationMs / this.inferenceCount);
    this.logger.log(
      `ONNX text moderation inference: window_ms=${Math.round(windowDurationMs)}, runs=${this.inferenceCount}, failures=${this.inferenceFailureCount}, average_ms=${averageDurationMs}, max_ms=${this.maxInferenceDurationMs}`,
    );
    this.inferenceMetricsWindowStartedAt = now;
    this.inferenceCount = 0;
    this.inferenceFailureCount = 0;
    this.inferenceDurationMs = 0;
    this.maxInferenceDurationMs = 0;
  }

  private async setStatus(item: TextModerationItem, status: 'visible' | 'pending') {
    await this.prisma.$transaction(async (transaction) => {
      if (item.targetType === 'comment') {
        const update = await transaction.comment.updateMany({
          where: { id: item.id, moderationStatus: 'processing' },
          data: { moderationStatus: status, moderationProcessingStartedAt: null },
        });
        if (status === 'visible' && update.count === 1) {
          await this.contentNotifications.notifyPublishedComment(transaction, item.id);
        }
      } else if (item.targetType === 'group_post') {
        const update = await transaction.groupPost.updateMany({
          where: { id: item.id, moderationStatus: 'processing' },
          data: { moderationStatus: status, moderationProcessingStartedAt: null },
        });
        if (status === 'visible' && update.count === 1) {
          await this.contentNotifications.notifyPublishedGroupPost(transaction, item.id);
        }
      } else {
        await transaction.activity.updateMany({
          where: { id: item.id, textModerationStatus: 'processing' },
          data: { textModerationStatus: status, textModerationProcessingStartedAt: null },
        });
      }
    });
  }

  private async queueForReview(item: TextModerationItem, result: ClassificationResult) {
    await this.prisma.$transaction(async (transaction) => {
      const existingReport = await transaction.contentReport.findFirst({
        where: {
          targetType: item.targetType,
          targetId: item.id,
          status: { in: [...ACTIVE_REPORT_STATUSES] },
        },
        select: { id: true },
      });
      if (item.targetType === 'comment') {
        const update = await transaction.comment.updateMany({
          where: { id: item.id, moderationStatus: 'processing' },
          data: { moderationStatus: 'pending', moderationProcessingStartedAt: null },
        });
        if (update.count !== 1) return;
      } else if (item.targetType === 'group_post') {
        const update = await transaction.groupPost.updateMany({
          where: { id: item.id, moderationStatus: 'processing' },
          data: { moderationStatus: 'pending', moderationProcessingStartedAt: null },
        });
        if (update.count !== 1) return;
      } else {
        const update = await transaction.activity.updateMany({
          where: { id: item.id, textModerationStatus: 'processing' },
          data: { textModerationStatus: 'pending', textModerationProcessingStartedAt: null },
        });
        if (update.count !== 1) return;
      }
      if (existingReport) return;

      const report = await transaction.contentReport.create({
        data: {
          targetType: item.targetType,
          targetId: item.id,
          ...(item.targetType === 'comment' ? { commentId: item.id } : {}),
          ...(item.targetType === 'group_post' ? { groupPostId: item.id } : {}),
          ...(item.targetType === 'activity_text' ? { activityId: item.id } : {}),
          subjectUserId: item.ownerId,
          reason: 'other',
          details: `${result.reason} ${Object.entries(result.scores)
            .map(([label, score]) => `${label}=${score.toFixed(3)}`)
            .join(', ')} Model: ${result.modelVersion}. Решение принимает модератор.`,
          priority: 'high',
        },
        select: { id: true },
      });
      await transaction.emailNotificationJob.create({
        data: {
          notificationType: EMAIL_NOTIFICATION_TYPE.moderationReport,
          sourceId: report.id,
          status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
        },
      });
    });
  }

  private async requeueInterruptedItems() {
    const staleBefore = new Date(Date.now() - TEXT_MODERATION_STALE_PROCESSING_MS);
    await Promise.all([
      this.prisma.comment.updateMany({
        where: { moderationStatus: 'processing', moderationProcessingStartedAt: { lt: staleBefore } },
        data: { moderationStatus: 'pending', moderationProcessingStartedAt: null },
      }),
      this.prisma.groupPost.updateMany({
        where: { moderationStatus: 'processing', moderationProcessingStartedAt: { lt: staleBefore } },
        data: { moderationStatus: 'pending', moderationProcessingStartedAt: null },
      }),
      this.prisma.activity.updateMany({
        where: { textModerationStatus: 'processing', textModerationProcessingStartedAt: { lt: staleBefore } },
        data: { textModerationStatus: 'pending', textModerationProcessingStartedAt: null },
      }),
    ]);
  }
}
