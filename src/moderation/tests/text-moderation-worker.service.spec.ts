import { jest } from '@jest/globals';
import { asyncMock, transactionMock } from 'src/tests/helpers';
import { TextModerationWorkerService } from '../services/text-moderation-worker.service';

function createPrismaMock() {
  const transaction = {
    comment: { updateMany: asyncMock() },
    groupPost: { updateMany: asyncMock() },
    activity: { updateMany: asyncMock() },
    contentReport: { findFirst: asyncMock(), create: asyncMock() },
    emailNotificationJob: { create: asyncMock() },
  };
  const prisma = {
    comment: { findFirst: asyncMock(), updateMany: asyncMock() },
    groupPost: { findFirst: asyncMock(), updateMany: asyncMock() },
    activity: { findFirst: asyncMock(), update: asyncMock(), updateMany: asyncMock() },
    contentReport: { findFirst: asyncMock(), create: asyncMock() },
    emailNotificationJob: { create: asyncMock() },
    transaction,
  };
  return Object.assign(prisma, { $transaction: transactionMock(transaction) });
}

describe('TextModerationWorkerService', () => {
  const originalEnvironment = {
    legacyToken: process.env.HF_TOKEN,
    legacyModel: process.env.TEXT_MODERATION_HF_MODEL,
    threshold: process.env.TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD,
  };
  const localClassifier = {
    classify: jest.fn(async () => [
      { label: 'not-toxic', score: 0.99 },
      { label: 'toxic', score: 0.01 },
    ]),
  };
  const contentNotifications = {
    notifyPublishedComment: asyncMock(),
    notifyPublishedGroupPost: asyncMock(),
  };
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: TextModerationWorkerService;

  beforeEach(() => {
    delete process.env.HF_TOKEN;
    delete process.env.TEXT_MODERATION_HF_MODEL;
    delete process.env.TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD;
    localClassifier.classify.mockReset().mockResolvedValue([
      { label: 'not-toxic', score: 0.99 },
      { label: 'toxic', score: 0.01 },
    ]);
    contentNotifications.notifyPublishedComment.mockReset().mockResolvedValue(undefined);
    contentNotifications.notifyPublishedGroupPost.mockReset().mockResolvedValue(undefined);
    prisma = createPrismaMock();
    service = new TextModerationWorkerService(prisma as never, localClassifier as never, contentNotifications as never);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('payment required', { status: 402 }));
    prisma.comment.updateMany.mockResolvedValue({ count: 1 });
    prisma.groupPost.updateMany.mockResolvedValue({ count: 1 });
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.comment.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.groupPost.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.activity.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.contentReport.findFirst.mockResolvedValue(null);
    prisma.transaction.contentReport.create.mockResolvedValue({ id: 'report-1' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [name, value] of Object.entries({
      HF_TOKEN: originalEnvironment.legacyToken,
      TEXT_MODERATION_HF_MODEL: originalEnvironment.legacyModel,
      TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD: originalEnvironment.threshold,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('uses the local ONNX classifier to make a low risk comment visible without network requests', async () => {
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-1',
      comment: 'A friendly comment',
      authorId: 'author-1',
    });
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);

    await expect(service.processNextText()).resolves.toBe(true);

    expect(prisma.comment.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'comment-1', moderationStatus: 'pending' },
        data: expect.objectContaining({ moderationStatus: 'processing' }),
      }),
    );
    expect(prisma.transaction.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'comment-1', moderationStatus: 'processing' },
      data: { moderationStatus: 'visible', moderationProcessingStartedAt: null },
    });
    expect(contentNotifications.notifyPublishedComment).toHaveBeenCalledWith(prisma.transaction, 'comment-1');
    expect(fetch).not.toHaveBeenCalled();
    expect(prisma.transaction.contentReport.create).not.toHaveBeenCalled();
    expect(localClassifier.classify).toHaveBeenCalledWith('A friendly comment');
  });

  it('sends repeated links to manual review without classification', async () => {
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-2',
      comment: 'Repeated links https://example.test https://example.test',
      authorId: 'author-2',
    });
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);

    await expect(service.processNextText()).resolves.toBe(true);

    expect(fetch).not.toHaveBeenCalled();
    expect(localClassifier.classify).not.toHaveBeenCalled();
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: 'comment',
          commentId: 'comment-2',
          subjectUserId: 'author-2',
          priority: 'high',
          details: expect.stringContaining('link_spam'),
        }),
      }),
    );
    expect(contentNotifications.notifyPublishedComment).not.toHaveBeenCalled();
    expect(prisma.transaction.emailNotificationJob.create).toHaveBeenCalledWith({
      data: { notificationType: 'moderation-report', sourceId: 'report-1', status: 'queued' },
    });
  });

  it('sends locally classified toxic content to manual review', async () => {
    localClassifier.classify.mockResolvedValueOnce([
      { label: 'not-toxic', score: 0.1 },
      { label: 'toxic', score: 0.9 },
    ]);
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-3',
      comment: 'No model configuration',
      authorId: 'author-3',
    });
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);

    await service.processNextText();

    expect(fetch).not.toHaveBeenCalled();
    expect(localClassifier.classify).toHaveBeenCalledWith('No model configuration');
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.stringContaining('Локальная ONNX оценка toxic=0.900'),
        }),
      }),
    );
  });

  it('makes non-toxic content visible based on its local ONNX score', async () => {
    localClassifier.classify.mockResolvedValueOnce([
      { label: 'not-toxic', score: 0.7 },
      { label: 'toxic', score: 0.3 },
    ]);
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-local-safe',
      comment: 'A kind comment',
      authorId: 'author-local-safe',
    });
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);

    await service.processNextText();

    expect(prisma.transaction.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'comment-local-safe', moderationStatus: 'processing' },
      data: { moderationStatus: 'visible', moderationProcessingStartedAt: null },
    });
    expect(contentNotifications.notifyPublishedComment).toHaveBeenCalledWith(prisma.transaction, 'comment-local-safe');
    expect(prisma.transaction.contentReport.create).not.toHaveBeenCalled();
  });

  it('ignores legacy Hugging Face settings and keeps classification local', async () => {
    process.env.HF_TOKEN = 'legacy-token';
    process.env.TEXT_MODERATION_HF_MODEL = 'org/legacy-model';
    localClassifier.classify.mockResolvedValueOnce([
      { label: 'not-toxic', score: 0.2 },
      { label: 'toxic', score: 0.8 },
    ]);
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-quota',
      comment: 'A potentially toxic comment',
      authorId: 'author-quota',
    });
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);
    await service.processNextText();

    expect(fetch).not.toHaveBeenCalled();
    expect(localClassifier.classify).toHaveBeenCalledWith('A potentially toxic comment');
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.stringContaining('Локальная ONNX оценка toxic=0.800'),
        }),
      }),
    );
  });

  it('keeps content in manual review when the local model is unavailable', async () => {
    localClassifier.classify.mockRejectedValueOnce(new Error('weights are missing'));
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-manual-fallback',
      comment: 'Text needing moderation',
      authorId: 'author-manual-fallback',
    });
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);

    await service.processNextText();

    expect(prisma.transaction.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.stringContaining('Автоматическая проверка недоступна: weights are missing.'),
        }),
      }),
    );
  });

  it('queues scores at the configured threshold for moderator review', async () => {
    process.env.TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD = '0.7';
    localClassifier.classify.mockResolvedValueOnce([
      { label: 'not-toxic', score: 0.3 },
      { label: 'toxic', score: 0.7 },
    ]);
    prisma.groupPost.findFirst.mockResolvedValue({
      id: 'post-1',
      text: 'Post text',
      createdByUserId: 'post-author',
    });
    prisma.activity.findFirst.mockResolvedValue(null);

    await expect(service.processNextText()).resolves.toBe(true);

    expect(fetch).not.toHaveBeenCalled();
    expect(localClassifier.classify).toHaveBeenCalledWith('Post text');
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: 'group_post',
          groupPostId: 'post-1',
          subjectUserId: 'post-author',
        }),
      }),
    );
    expect(prisma.transaction.groupPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1', moderationStatus: 'processing' },
        data: { moderationStatus: 'pending', moderationProcessingStartedAt: null },
      }),
    );
    expect(contentNotifications.notifyPublishedGroupPost).not.toHaveBeenCalled();
  });

  it('queues activity title and description together for manual review', async () => {
    prisma.comment.findFirst.mockResolvedValue(null);
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue({
      id: 'activity-1',
      title: 'Morning run',
      description: 'A route through the park',
      userId: 'activity-owner',
    });
    localClassifier.classify.mockResolvedValueOnce([
      { label: 'not-toxic', score: 0.2 },
      { label: 'toxic', score: 0.8 },
    ]);

    await expect(service.processNextText()).resolves.toBe(true);

    expect(fetch).not.toHaveBeenCalled();
    expect(localClassifier.classify).toHaveBeenCalledWith('Morning run A route through the park');
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: 'activity_text',
          activityId: 'activity-1',
          subjectUserId: 'activity-owner',
        }),
      }),
    );
  });

  it('makes an empty activity text visible without calling the classifier', async () => {
    prisma.comment.findFirst.mockResolvedValue(null);
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue({
      id: 'activity-2',
      title: ' ',
      description: null,
      userId: 'activity-owner',
    });

    await expect(service.processNextText()).resolves.toBe(false);

    expect(fetch).not.toHaveBeenCalled();
    expect(localClassifier.classify).not.toHaveBeenCalled();
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-2' },
      data: { textModerationStatus: 'visible', textModerationProcessingStartedAt: null },
    });
  });

  it('does not classify a comment after another worker wins the atomic claim', async () => {
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-4',
      comment: 'A comment',
      authorId: 'author-4',
    });
    prisma.comment.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.processNextText()).resolves.toBe(true);

    expect(fetch).not.toHaveBeenCalled();
    expect(localClassifier.classify).not.toHaveBeenCalled();
    expect(prisma.transaction.contentReport.create).not.toHaveBeenCalled();
  });

  it('skips content with an active report when its optional relation foreign key is missing', async () => {
    const comment = {
      id: 'comment-with-unlinked-report',
      comment: 'Already reported comment',
      authorId: 'author-with-unlinked-report',
    };
    prisma.comment.findFirst.mockResolvedValueOnce(comment).mockResolvedValueOnce(null);
    prisma.contentReport.findFirst.mockResolvedValueOnce({ id: 'active-report' });
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);

    await expect(service.processNextText()).resolves.toBe(false);

    expect(prisma.contentReport.findFirst).toHaveBeenCalledWith({
      where: {
        targetType: 'comment',
        targetId: comment.id,
        status: { in: ['open', 'in_review', 'appealed'] },
      },
      select: { id: true },
    });
    expect(prisma.comment.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ id: { notIn: [comment.id] } }) }),
    );
    expect(localClassifier.classify).not.toHaveBeenCalled();
    expect(prisma.comment.updateMany).not.toHaveBeenCalled();
  });

  it('avoids creating duplicate moderator reports for content already under review', async () => {
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-5',
      comment: 'Repeated links https://example.test https://example.test',
      authorId: 'author-5',
    });
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);
    prisma.transaction.contentReport.findFirst.mockResolvedValue({ id: 'existing-report' });

    await service.processNextText();

    expect(prisma.transaction.contentReport.create).not.toHaveBeenCalled();
    expect(prisma.transaction.emailNotificationJob.create).not.toHaveBeenCalled();
    expect(prisma.transaction.comment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comment-5', moderationStatus: 'processing' },
        data: { moderationStatus: 'pending', moderationProcessingStartedAt: null },
      }),
    );
  });

  it('does not report a stale classification if the author edits the comment during inference', async () => {
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-edited-during-review',
      comment: 'The earlier text was flagged',
      authorId: 'author-8',
    });
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);
    localClassifier.classify.mockResolvedValueOnce([
      { label: 'not-toxic', score: 0.1 },
      { label: 'toxic', score: 0.9 },
    ]);
    prisma.transaction.comment.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.processNextText()).resolves.toBe(true);

    expect(prisma.transaction.contentReport.create).not.toHaveBeenCalled();
    expect(prisma.transaction.emailNotificationJob.create).not.toHaveBeenCalled();
  });

  it('uses a fair target order and requeues stale processing items before stopping', async () => {
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-6',
      comment: 'A comment',
      authorId: 'author-6',
    });
    prisma.groupPost.findFirst.mockResolvedValue({
      id: 'post-2',
      text: 'A post',
      createdByUserId: 'author-2',
    });
    prisma.activity.findFirst.mockResolvedValue(null);

    await service.processNextText();
    await service.processNextText();

    expect(prisma.groupPost.findFirst).toHaveBeenCalledTimes(1);
    expect(contentNotifications.notifyPublishedComment).toHaveBeenCalledWith(prisma.transaction, 'comment-6');
    expect(contentNotifications.notifyPublishedGroupPost).toHaveBeenCalledWith(prisma.transaction, 'post-2');
    service.requestStop();
    const worker = service.runWorker();
    service.requestStop();
    await worker;

    expect(prisma.comment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          moderationStatus: 'processing',
          moderationProcessingStartedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );
  });

  it('keeps classifier failures in manual review and reports locally classified toxic content', async () => {
    const content = {
      id: 'comment-7',
      comment: 'A comment',
      authorId: 'author-7',
    };
    prisma.comment.findFirst.mockResolvedValue(content);
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);
    localClassifier.classify.mockRejectedValueOnce(new Error('local model is unavailable'));
    await service.processNextText();
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.stringContaining('Автоматическая проверка недоступна: local model is unavailable.'),
        }),
      }),
    );

    prisma.comment.findFirst.mockResolvedValue(content);
    localClassifier.classify.mockResolvedValueOnce([
      { label: 'not-toxic', score: 0.1 },
      { label: 'toxic', score: 0.9 },
    ]);
    await service.processNextText();
    expect(fetch).not.toHaveBeenCalled();
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledTimes(2);
    expect(prisma.transaction.contentReport.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.stringContaining('Локальная ONNX оценка toxic=0.900'),
        }),
      }),
    );
  });
});
