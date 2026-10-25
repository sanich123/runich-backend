import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { asyncMock, transactionMock } from 'src/tests/helpers';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import {
  MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION,
  MEDIA_MODERATION_MODEL_VERSION,
  MEDIA_MODERATION_RETRY_LIMIT,
} from '../media-moderation-thresholds';
import { getMediaModerationProviderName, getMediaModerationReviewReason } from '../media-moderation-worker.helpers';
import { MediaModerationWorkerService } from '../media-moderation-worker.service';

function createPrismaMock() {
  const prisma = {
    mediaModerationAsset: { findFirst: asyncMock(), update: asyncMock(), updateMany: asyncMock() },
    contentReport: { findFirst: asyncMock(), create: asyncMock() },
    emailNotificationJob: { create: asyncMock() },
  };
  return Object.assign(prisma, { $transaction: transactionMock(prisma) });
}

const queuedAsset = {
  id: 'asset-1',
  ownerId: 'owner-1',
  quarantineKey: 'moderation-quarantine/owner-1/asset-1.jpg',
  contentType: 'image/webp',
  status: 'queued',
  attempts: 0,
};

function spyOnScanner(worker: MediaModerationWorkerService) {
  const scanner = (worker as unknown as { scanner: { scan: (asset: unknown) => Promise<unknown> } }).scanner;
  return jest.spyOn(scanner, 'scan');
}

describe('MediaModerationWorkerService', () => {
  it('reports the provider for Google Vision, NSFWJS, and mixed scans', () => {
    expect(getMediaModerationProviderName(MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION)).toBe(
      'Google Cloud Vision SafeSearch',
    );
    expect(getMediaModerationProviderName(MEDIA_MODERATION_MODEL_VERSION)).toBe('NSFWJS');
    expect(
      getMediaModerationProviderName(
        `${MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION}+${MEDIA_MODERATION_MODEL_VERSION}`,
      ),
    ).toBe('Google Cloud Vision SafeSearch и NSFWJS');
  });

  it('returns false when the queue is empty and does not claim an upload already claimed by another worker', async () => {
    const prisma = createPrismaMock();
    const worker = new MediaModerationWorkerService(prisma as never, {} as never);
    prisma.mediaModerationAsset.findFirst.mockResolvedValue(null);
    await expect(worker.processNextAsset()).resolves.toBe(false);

    prisma.mediaModerationAsset.findFirst.mockResolvedValue(queuedAsset);
    prisma.mediaModerationAsset.updateMany.mockResolvedValue({ count: 0 });
    await expect(worker.processNextAsset()).resolves.toBe(true);
    expect(prisma.mediaModerationAsset.update).not.toHaveBeenCalled();
  });

  it('automatically publishes a clean image and stores the scan result', async () => {
    const prisma = createPrismaMock();
    const storage = { approveModerationAsset: asyncMock() };
    const worker = new MediaModerationWorkerService(prisma as never, storage as never);
    spyOnScanner(worker).mockResolvedValue({ scores: { Drawing: 0.98, Porn: 0.01 }, frameCount: null });
    prisma.mediaModerationAsset.findFirst.mockResolvedValue(queuedAsset);
    prisma.mediaModerationAsset.updateMany.mockResolvedValue({ count: 1 });

    await expect(worker.processNextAsset()).resolves.toBe(true);
    expect(storage.approveModerationAsset).toHaveBeenCalledWith('asset-1');
    expect(prisma.mediaModerationAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: expect.objectContaining({
        status: 'approved',
        scores: { Drawing: 0.98, Porn: 0.01 },
        frameCount: null,
        modelVersion: MEDIA_MODERATION_MODEL_VERSION,
        processingStartedAt: null,
      }),
    });
  });

  it('sends uncertain results to moderator review and queues a notification email once', async () => {
    const prisma = createPrismaMock();
    const worker = new MediaModerationWorkerService(prisma as never, {} as never);
    spyOnScanner(worker).mockResolvedValue({ scores: { Porn: 0.8, Sexy: 0.65 }, frameCount: 12 });
    prisma.mediaModerationAsset.findFirst.mockResolvedValue(queuedAsset);
    prisma.mediaModerationAsset.updateMany.mockResolvedValue({ count: 1 });
    prisma.contentReport.findFirst.mockResolvedValue(null);
    prisma.contentReport.create.mockResolvedValue({ id: 'report-1' });

    await expect(worker.processNextAsset()).resolves.toBe(true);
    expect(prisma.mediaModerationAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: expect.objectContaining({
        status: 'review_required',
        frameCount: 12,
        modelVersion: MEDIA_MODERATION_MODEL_VERSION,
      }),
    });
    expect(prisma.contentReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: 'media_upload',
        targetId: 'asset-1',
        mediaUploadId: 'asset-1',
        subjectUserId: 'owner-1',
        priority: 'high',
      }),
      select: { id: true },
    });
    expect(prisma.emailNotificationJob.create).toHaveBeenCalledWith({
      data: {
        notificationType: EMAIL_NOTIFICATION_TYPE.moderationReport,
        sourceId: 'report-1',
        status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
      },
    });

    prisma.contentReport.findFirst.mockResolvedValue({ id: 'already-open' });
    await worker.processNextAsset();
    expect(prisma.contentReport.create).toHaveBeenCalledTimes(1);
  });

  it('sends an uncertain image to review without claiming a video frame count', async () => {
    const prisma = createPrismaMock();
    const worker = new MediaModerationWorkerService(prisma as never, {} as never);
    spyOnScanner(worker).mockResolvedValue({ scores: { Porn: 0.8 }, frameCount: null });
    prisma.mediaModerationAsset.findFirst.mockResolvedValue(queuedAsset);
    prisma.mediaModerationAsset.updateMany.mockResolvedValue({ count: 1 });
    prisma.contentReport.findFirst.mockResolvedValue(null);
    prisma.contentReport.create.mockResolvedValue({ id: 'report-image' });

    await worker.processNextAsset();

    expect(prisma.contentReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ details: expect.not.stringContaining('Кадров проверено:') }),
      select: { id: true },
    });
  });

  it('retries scan failures and sends exhausted uploads to manual review', async () => {
    const prisma = createPrismaMock();
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const worker = new MediaModerationWorkerService(prisma as never, {} as never);
    spyOnScanner(worker).mockRejectedValue(new Error('model unavailable'));
    prisma.mediaModerationAsset.updateMany.mockResolvedValue({ count: 1 });

    prisma.mediaModerationAsset.findFirst.mockResolvedValue(queuedAsset);
    await worker.processNextAsset();
    expect(prisma.mediaModerationAsset.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'asset-1', status: 'processing' },
      data: { status: 'queued', processingStartedAt: null },
    });

    prisma.mediaModerationAsset.findFirst.mockResolvedValue({
      ...queuedAsset,
      attempts: MEDIA_MODERATION_RETRY_LIMIT - 1,
    });
    prisma.contentReport.findFirst.mockResolvedValue(null);
    prisma.contentReport.create.mockResolvedValue({ id: 'scan-failure-report' });
    await worker.processNextAsset();
    expect(prisma.mediaModerationAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: expect.objectContaining({
        status: 'review_required',
        scores: {},
        frameCount: null,
        scannedAt: expect.any(Date),
        processingStartedAt: null,
      }),
    });
    expect(prisma.contentReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: 'media_upload',
        targetId: 'asset-1',
        reason: 'other',
        details: expect.stringContaining('Требуется ручная проверка'),
      }),
      select: { id: true },
    });
    expect(prisma.emailNotificationJob.create).toHaveBeenCalledWith({
      data: {
        notificationType: EMAIL_NOTIFICATION_TYPE.moderationReport,
        sourceId: 'scan-failure-report',
        status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
      },
    });
    expect(loggerError).toHaveBeenCalledTimes(2);
    loggerError.mockRestore();
  });

  it('dispatches queued images and videos to the scanner', async () => {
    const prisma = createPrismaMock();
    const worker = new MediaModerationWorkerService(prisma as never, { approveModerationAsset: asyncMock() } as never);
    const scan = spyOnScanner(worker)
      .mockResolvedValueOnce({ scores: { Drawing: 0.99 }, frameCount: null })
      .mockResolvedValueOnce({ scores: { Drawing: 0.98 }, frameCount: 2 });
    const videoAsset = { ...queuedAsset, id: 'asset-video', contentType: 'video/mp4' };
    prisma.mediaModerationAsset.findFirst.mockResolvedValueOnce(queuedAsset).mockResolvedValueOnce(videoAsset);
    prisma.mediaModerationAsset.updateMany.mockResolvedValue({ count: 1 });

    await worker.processNextAsset();
    await worker.processNextAsset();

    expect(scan).toHaveBeenNthCalledWith(1, queuedAsset);
    expect(scan).toHaveBeenNthCalledWith(2, videoAsset);
  });

  it('handles non-Error scan failures and reports score categories that need review', async () => {
    const prisma = createPrismaMock();
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const worker = new MediaModerationWorkerService(prisma as never, {} as never);
    spyOnScanner(worker).mockRejectedValue('model unavailable');
    prisma.mediaModerationAsset.findFirst.mockResolvedValue(queuedAsset);
    prisma.mediaModerationAsset.updateMany.mockResolvedValue({ count: 1 });

    await worker.processNextAsset();

    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('asset-1'), 'model unavailable');
    expect(getMediaModerationReviewReason({})).toBeNull();
    expect(getMediaModerationReviewReason({ Porn: 0.99 })).toContain('Porn=0.99');
    expect(getMediaModerationReviewReason({ Porn: 0.99, Hentai: 0.8 })).toBe('Porn=0.99, Hentai=0.80');
    loggerError.mockRestore();
  });

  it('waits between idle polls and backs off after an unexpected worker-loop error', async () => {
    jest.useFakeTimers();
    try {
      const prisma = createPrismaMock();
      const worker = new MediaModerationWorkerService(prisma as never, {} as never);
      const processNextAsset = jest
        .spyOn(worker, 'processNextAsset')
        .mockImplementationOnce(async () => false)
        .mockImplementationOnce(async () => {
          worker.requestStop();
          return true;
        });
      const idleLoop = worker.runWorker();
      await jest.advanceTimersByTimeAsync(2000);
      await idleLoop;
      expect(processNextAsset).toHaveBeenCalledTimes(2);

      const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const failingWorker = new MediaModerationWorkerService(createPrismaMock() as never, {} as never);
      jest.spyOn(failingWorker, 'processNextAsset').mockImplementation(async () => {
        failingWorker.requestStop();
        throw 'scanner unavailable';
      });
      const errorLoop = failingWorker.runWorker();
      await jest.advanceTimersByTimeAsync(2000);
      await errorLoop;
      expect(loggerError).toHaveBeenCalledWith('Ошибка цикла проверки пользовательского медиа', 'scanner unavailable');
      loggerError.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('logs an Error stack when the worker loop fails', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const worker = new MediaModerationWorkerService(createPrismaMock() as never, {} as never);
    const error = new Error('database unavailable');
    jest.spyOn(worker, 'processNextAsset').mockImplementation(async () => {
      worker.requestStop();
      throw error;
    });

    const runWorker = worker.runWorker();
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await runWorker;

    expect(loggerError).toHaveBeenCalledWith('Ошибка цикла проверки пользовательского медиа', error.stack);
    loggerError.mockRestore();
  });

  it('requeues stale processing assets before the worker loop and exits on requestStop', async () => {
    const prisma = createPrismaMock();
    const worker = new MediaModerationWorkerService(prisma as never, {} as never);
    const processNextAsset = jest.spyOn(worker, 'processNextAsset').mockImplementation(async () => {
      worker.requestStop();
      return true;
    });

    await worker.runWorker();

    expect(prisma.mediaModerationAsset.updateMany).toHaveBeenCalledWith({
      where: { status: 'processing', processingStartedAt: { lt: expect.any(Date) } },
      data: { status: 'queued', processingStartedAt: null },
    });
    expect(processNextAsset).toHaveBeenCalledTimes(1);
  });
});
