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
    token: process.env.HF_TOKEN,
    model: process.env.TEXT_MODERATION_HF_MODEL,
    threshold: process.env.TEXT_MODERATION_REVIEW_THRESHOLD,
    localThreshold: process.env.TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD,
    localTerms: process.env.TEXT_MODERATION_LOCAL_TERMS,
  };
  const localClassifier = {
    classify: jest.fn(async () => [
      { label: 'not-toxic', score: 0.99 },
      { label: 'toxic', score: 0.01 },
    ]),
  };
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: TextModerationWorkerService;

  beforeEach(() => {
    process.env.HF_TOKEN = 'test-hf-token';
    delete process.env.TEXT_MODERATION_HF_MODEL;
    delete process.env.TEXT_MODERATION_REVIEW_THRESHOLD;
    delete process.env.TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD;
    delete process.env.TEXT_MODERATION_LOCAL_TERMS;
    localClassifier.classify.mockReset().mockResolvedValue([
      { label: 'not-toxic', score: 0.99 },
      { label: 'toxic', score: 0.01 },
    ]);
    prisma = createPrismaMock();
    service = new TextModerationWorkerService(prisma as never, localClassifier as never);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([[{ label: 'toxic', score: 0.01 }]]), { status: 200 }));
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
      HF_TOKEN: originalEnvironment.token,
      TEXT_MODERATION_HF_MODEL: originalEnvironment.model,
      TEXT_MODERATION_REVIEW_THRESHOLD: originalEnvironment.threshold,
      TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD: originalEnvironment.localThreshold,
      TEXT_MODERATION_LOCAL_TERMS: originalEnvironment.localTerms,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('claims a pending comment and makes it visible when Hugging Face reports a low risk score', async () => {
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
    expect(prisma.comment.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'comment-1', moderationStatus: 'processing' },
        data: { moderationStatus: 'visible', moderationProcessingStartedAt: null },
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://router.huggingface.co/hf-inference/models/unitary/multilingual-toxic-xlm-roberta',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-hf-token' }),
        body: JSON.stringify({
          inputs: 'A friendly comment',
          parameters: { function_to_apply: 'sigmoid', top_k: 20 },
        }),
      }),
    );
    expect(prisma.transaction.contentReport.create).not.toHaveBeenCalled();
    expect(localClassifier.classify).not.toHaveBeenCalled();
  });

  it('sends text matching a configured local term to manual review without calling Hugging Face', async () => {
    process.env.TEXT_MODERATION_LOCAL_TERMS = 'blocked phrase';
    prisma.comment.findFirst.mockResolvedValue({
      id: 'comment-2',
      comment: 'This contains BLOCKED PHRASE',
      authorId: 'author-2',
    });
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);

    await expect(service.processNextText()).resolves.toBe(true);

    expect(fetch).not.toHaveBeenCalled();
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: 'comment',
          commentId: 'comment-2',
          subjectUserId: 'author-2',
          priority: 'high',
          details: expect.stringContaining('local-rules-v1'),
        }),
      }),
    );
    expect(prisma.transaction.emailNotificationJob.create).toHaveBeenCalledWith({
      data: { notificationType: 'moderation-report', sourceId: 'report-1', status: 'queued' },
    });
  });

  it('uses the local classifier when the Hugging Face token is missing', async () => {
    delete process.env.HF_TOKEN;
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
          details: expect.stringContaining('HF_TOKEN не настроен; локальная ONNX оценка toxic=0.900'),
        }),
      }),
    );
  });

  it('makes non-toxic content visible when the Hugging Face token is missing', async () => {
    delete process.env.HF_TOKEN;
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

    expect(prisma.comment.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'comment-local-safe', moderationStatus: 'processing' },
        data: { moderationStatus: 'visible', moderationProcessingStartedAt: null },
      }),
    );
    expect(prisma.transaction.contentReport.create).not.toHaveBeenCalled();
  });

  it('uses the local classifier when Hugging Face rejects the exhausted quota', async () => {
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
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('quota exceeded', { status: 429 }));

    await service.processNextText();

    expect(localClassifier.classify).toHaveBeenCalledWith('A potentially toxic comment');
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.stringContaining(
            'Hugging Face недоступен (Hugging Face вернул HTTP 429); локальная ONNX оценка toxic=0.800',
          ),
        }),
      }),
    );
  });

  it('keeps content in manual review when both Hugging Face and the local model are unavailable', async () => {
    delete process.env.HF_TOKEN;
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
          details: expect.stringContaining('HF_TOKEN не настроен; локальная модель недоступна: weights are missing'),
        }),
      }),
    );
  });

  it('queues scores at the configured threshold for moderator review', async () => {
    process.env.TEXT_MODERATION_HF_MODEL = 'org/custom-model';
    process.env.TEXT_MODERATION_REVIEW_THRESHOLD = '0.7';
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([{ label: 'threat', score: 0.7 }]), { status: 200 }));
    prisma.groupPost.findFirst.mockResolvedValue({
      id: 'post-1',
      text: 'Post text',
      createdByUserId: 'post-author',
    });
    prisma.activity.findFirst.mockResolvedValue(null);

    await expect(service.processNextText()).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledWith(
      'https://router.huggingface.co/hf-inference/models/org/custom-model',
      expect.anything(),
    );
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
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([{ label: 'toxic', score: 0.8 }]), { status: 200 }));

    await expect(service.processNextText()).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          inputs: 'Morning run A route through the park',
          parameters: { function_to_apply: 'sigmoid', top_k: 20 },
        }),
      }),
    );
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
    expect(prisma.transaction.contentReport.create).not.toHaveBeenCalled();
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
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([{ label: 'threat', score: 0.9 }]), { status: 200 }));
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

  it('falls back to the local classifier for invalid HF results and keeps classifier failures in manual review', async () => {
    const content = {
      id: 'comment-7',
      comment: 'A comment',
      authorId: 'author-7',
    };
    prisma.comment.findFirst.mockResolvedValue(content);
    prisma.groupPost.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(null);
    localClassifier.classify.mockRejectedValueOnce(new Error('local model is unavailable'));
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([{ label: 'LABEL_0', score: 0.1 }]), { status: 200 }));
    await service.processNextText();
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.stringContaining(
            'Модель не вернула ни одной распознанной категории риска); локальная модель недоступна: local model is unavailable',
          ),
        }),
      }),
    );

    prisma.comment.findFirst.mockResolvedValue(content);
    localClassifier.classify.mockResolvedValueOnce([
      { label: 'not-toxic', score: 0.1 },
      { label: 'toxic', score: 0.9 },
    ]);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unavailable', { status: 503 }));
    await service.processNextText();
    expect(prisma.transaction.contentReport.create).toHaveBeenCalledTimes(2);
    expect(prisma.transaction.contentReport.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.stringContaining(
            'Hugging Face недоступен (Hugging Face вернул HTTP 503); локальная ONNX оценка toxic=0.900',
          ),
        }),
      }),
    );
  });
});
