import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ActivityService } from '../activity.service';
import { asyncMock } from 'src/tests/helpers';
import { jest } from '@jest/globals';

function createService(ownerId = 'owner-1') {
  const mediaFindFirst = asyncMock();
  const mediaDelete = asyncMock();
  const transaction = { activityMedia: { findFirst: mediaFindFirst, delete: mediaDelete } };
  const prisma = {
    activity: { findUnique: asyncMock().mockResolvedValue({ userId: ownerId }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback(transaction)) as never);
  const storage = {
    getOwnedKey: jest.fn((_userId: string, url: string) =>
      url.endsWith('thumb.jpg') ? 'photo-thumb.jpg' : 'photo.jpg',
    ),
  };
  const cleanup = { enqueueObjectCleanup: asyncMock() };
  const service = new ActivityService(prisma as never, {} as never, undefined, storage as never, cleanup as never);

  return { service, prisma, transaction, mediaFindFirst, mediaDelete, storage, cleanup };
}

describe('ActivityService.deleteActivityMedia', () => {
  it('queues the original and thumbnail, then removes the media row in the transaction', async () => {
    const { service, transaction, mediaFindFirst, mediaDelete, storage, cleanup } = createService();
    mediaFindFirst.mockResolvedValue({
      url: 'https://cdn.example/owner/photo.jpg',
      thumbnail: 'https://cdn.example/owner/photo-thumb.jpg',
    });
    mediaDelete.mockResolvedValue({ id: 'media-1' });

    await expect(service.deleteActivityMedia('activity-1', 'media-1', 'owner-1')).resolves.toEqual({ success: true });

    expect(mediaFindFirst).toHaveBeenCalledWith({
      where: { id: 'media-1', activityId: 'activity-1', userId: 'owner-1' },
      select: { url: true, thumbnail: true },
    });
    expect(storage.getOwnedKey).toHaveBeenCalledTimes(2);
    expect(cleanup.enqueueObjectCleanup).toHaveBeenNthCalledWith(1, 'owner-1', 'photo.jpg', transaction);
    expect(cleanup.enqueueObjectCleanup).toHaveBeenNthCalledWith(2, 'owner-1', 'photo-thumb.jpg', transaction);
    expect(mediaDelete).toHaveBeenCalledWith({ where: { id: 'media-1' } });
  });

  it('rejects when the activity does not exist', async () => {
    const { service, prisma } = createService();
    prisma.activity.findUnique.mockResolvedValue(null);

    await expect(service.deleteActivityMedia('missing', 'media-1', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects when media cleanup services are not configured', async () => {
    const prisma = { activity: { findUnique: asyncMock().mockResolvedValue({ userId: 'owner-1' }) } };
    const service = new ActivityService(prisma as never, {} as never);

    await expect(service.deleteActivityMedia('activity-1', 'media-1', 'owner-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects when the media row does not exist', async () => {
    const { service, mediaFindFirst } = createService();
    mediaFindFirst.mockResolvedValue(null);

    await expect(service.deleteActivityMedia('activity-1', 'missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects non-owners before opening a transaction', async () => {
    const { service, prisma } = createService('owner-1');

    await expect(service.deleteActivityMedia('activity-1', 'media-1', 'viewer-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
