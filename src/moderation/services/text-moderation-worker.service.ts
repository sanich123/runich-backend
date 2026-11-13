import { Inject, Injectable, Logger } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { TextModerationLocalClassifierService } from './text-moderation-local-classifier.service';
import {
  ACTIVE_REPORT_STATUSES,
  DEFAULT_TEXT_MODERATION_MODEL,
  DEFAULT_TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD,
  DEFAULT_TEXT_MODERATION_REVIEW_THRESHOLD,
  LOCAL_TEXT_MODERATION_MODEL_VERSION,
  TEXT_MODERATION_POLL_INTERVAL_MS,
  TEXT_MODERATION_STALE_PROCESSING_MS,
  getTextModerationThreshold,
  getLocalReviewReason,
  normalizeModerationText,
  parseHuggingFaceLabels,
  isRiskLabel,
} from './text-moderation-worker.utils';
import type { ClassificationResult, TextModerationItem, TextTargetType } from './text-moderation-worker.utils';

@Injectable()
export class TextModerationWorkerService {
  private readonly logger = new Logger(TextModerationWorkerService.name);
  private stopRequested = false;
  private targetCursor = 0;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TextModerationLocalClassifierService)
    private readonly localClassifier: TextModerationLocalClassifierService,
  ) {}

  requestStop() {
    this.stopRequested = true;
  }

  async processNextText() {
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
          reason: `Автоматическая проверка недоступна: ${error instanceof Error ? error.message : 'ошибка запроса'}.`,
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
      `Worker премодерации текста запущен: poll=${TEXT_MODERATION_POLL_INTERVAL_MS}ms, model=${process.env.TEXT_MODERATION_HF_MODEL || DEFAULT_TEXT_MODERATION_MODEL}, локальный ONNX fallback включен`,
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

    const token = process.env.HF_TOKEN?.trim();
    if (!token) {
      return this.classifyLocally(normalized, 'HF_TOKEN не настроен');
    }

    const model = process.env.TEXT_MODERATION_HF_MODEL?.trim() || DEFAULT_TEXT_MODERATION_MODEL;
    try {
      const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: normalized, parameters: { function_to_apply: 'sigmoid', top_k: 20 } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Hugging Face вернул HTTP ${response.status}`);

      const payload: unknown = await response.json();
      const labels = parseHuggingFaceLabels(payload);
      if (!labels.length) throw new Error('Hugging Face вернул неожиданный формат оценки');
      const scores = Object.fromEntries(labels.map(({ label, score }) => [label, score]));
      const riskLabels = labels.filter(({ label }) => isRiskLabel(label));
      if (!riskLabels.length) throw new Error('Модель не вернула ни одной распознанной категории риска');
      const riskScore = Math.max(...riskLabels.map(({ score }) => score));
      const threshold = getTextModerationThreshold(
        'TEXT_MODERATION_REVIEW_THRESHOLD',
        DEFAULT_TEXT_MODERATION_REVIEW_THRESHOLD,
      );
      return {
        needsReview: riskScore >= threshold,
        scores,
        modelVersion: `huggingface:${model}`,
        reason: `Максимальная оценка риска ${riskScore.toFixed(3)}; порог ручной проверки ${threshold.toFixed(3)}.`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'ошибка запроса';
      this.logger.warn(`Hugging Face недоступен, переключаемся на локальную модель: ${reason}`);
      return this.classifyLocally(normalized, `Hugging Face недоступен (${reason})`);
    }
  }

  private async classifyLocally(text: string, fallbackReason: string): Promise<ClassificationResult> {
    try {
      const labels = await this.localClassifier.classify(text);
      const toxic = labels.find(({ label }) => label === 'toxic');
      if (!toxic) throw new Error('не найдена оценка toxic');
      const threshold = getTextModerationThreshold(
        'TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD',
        DEFAULT_TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD,
      );
      return {
        needsReview: toxic.score >= threshold,
        scores: Object.fromEntries(labels.map(({ label, score }) => [label, score])),
        modelVersion: LOCAL_TEXT_MODERATION_MODEL_VERSION,
        reason: `${fallbackReason}; локальная ONNX оценка toxic=${toxic.score.toFixed(3)}, порог=${threshold.toFixed(3)}.`,
      };
    } catch (error) {
      const localError = error instanceof Error ? error.message : 'ошибка локальной модели';
      throw new Error(`${fallbackReason}; локальная модель недоступна: ${localError}`, { cause: error });
    }
  }

  private async setStatus(item: TextModerationItem, status: 'visible' | 'pending') {
    if (item.targetType === 'comment') {
      await this.prisma.comment.updateMany({
        where: { id: item.id, moderationStatus: 'processing' },
        data: { moderationStatus: status, moderationProcessingStartedAt: null },
      });
    } else if (item.targetType === 'group_post') {
      await this.prisma.groupPost.updateMany({
        where: { id: item.id, moderationStatus: 'processing' },
        data: { moderationStatus: status, moderationProcessingStartedAt: null },
      });
    } else {
      await this.prisma.activity.updateMany({
        where: { id: item.id, textModerationStatus: 'processing' },
        data: { textModerationStatus: status, textModerationProcessingStartedAt: null },
      });
    }
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
