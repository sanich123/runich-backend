import { jest } from '@jest/globals';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { asyncMock } from 'src/tests/helpers';
import { MediaCleanupService } from '../media-cleanup.service';
import { MEDIA_CLEANUP_STATUS } from '../const';
import { StorageService } from '../storage.service';

describe('MediaCleanupService', () => {
  const database = {
    mediaCleanupJob: {
      create: asyncMock(),
      findFirst: asyncMock(),
      updateMany: asyncMock(),
      update: asyncMock(),
    },
  };
  const storageService = { deleteUserFiles: asyncMock() };
  let service: MediaCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaCleanupService(
      database as unknown as PrismaService,
      storageService as unknown as StorageService,
    );
    database.mediaCleanupJob.create.mockResolvedValue({ id: 'job-1', status: MEDIA_CLEANUP_STATUS.queued });
    database.mediaCleanupJob.updateMany.mockResolvedValue({ count: 1 });
    database.mediaCleanupJob.update.mockResolvedValue({});
  });

  it('enqueues cleanup using the transaction client supplied by account deletion', async () => {
    const transaction = { mediaCleanupJob: { create: asyncMock() } };
    transaction.mediaCleanupJob.create.mockResolvedValue({ id: 'job-1' });

    await expect(service.enqueueUserCleanup('user-1', transaction as never)).resolves.toEqual({ id: 'job-1' });
    expect(transaction.mediaCleanupJob.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', status: MEDIA_CLEANUP_STATUS.queued },
    });
  });

  it('deletes the user prefix and marks a queued job completed', async () => {
    database.mediaCleanupJob.findFirst.mockResolvedValue({ id: 'job-1', userId: 'user-1' });
    storageService.deleteUserFiles.mockResolvedValue({ deleted: 3 });

    await expect(service.processNextJob()).resolves.toBe(true);
    expect(database.mediaCleanupJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: MEDIA_CLEANUP_STATUS.queued },
      data: expect.objectContaining({ status: MEDIA_CLEANUP_STATUS.processing }),
    });
    expect(storageService.deleteUserFiles).toHaveBeenCalledWith('user-1');
    expect(database.mediaCleanupJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: MEDIA_CLEANUP_STATUS.completed, errorMessage: null }),
    });
  });

  it('records S3 failures without losing the cleanup job', async () => {
    database.mediaCleanupJob.findFirst.mockResolvedValue({ id: 'job-1', userId: 'user-1' });
    storageService.deleteUserFiles.mockRejectedValue(new Error('S3 unavailable'));

    await expect(service.processNextJob()).resolves.toBe(true);
    expect(database.mediaCleanupJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: MEDIA_CLEANUP_STATUS.failed, errorMessage: 'S3 unavailable' }),
    });
  });

  it('returns false when there are no queued cleanup jobs', async () => {
    database.mediaCleanupJob.findFirst.mockResolvedValue(null);

    await expect(service.processNextJob()).resolves.toBe(false);
    expect(storageService.deleteUserFiles).not.toHaveBeenCalled();
  });
});
