import { jest } from '@jest/globals';
import { ActivityMediaProcessingService } from '../services/activity-media-processing.service';
import { asyncMock } from 'src/tests/helpers';

function createPrismaMock() {
  return {
    activity: {
      findMany: asyncMock(),
      updateMany: asyncMock(),
      update: asyncMock(),
    },
    activityMedia: { updateMany: asyncMock() },
  };
}

describe('ActivityMediaProcessingService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns false when there are no queued activities', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityMediaProcessingService(prisma as never);
    prisma.activity.findMany.mockResolvedValue([]);

    await expect(service.processNextBatch()).resolves.toBe(false);
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });

  it('calculates missing media blurhashes in the background and completes the activity', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityMediaProcessingService(prisma as never);
    prisma.activity.findMany.mockResolvedValue([
      {
        id: 'activity-1',
        media: [{ position: 0, url: 'photo', thumbnail: null, blurhash: null }],
        mapPhotoUrl: 'map',
        mapPhotoUrlBlurhash: null,
      },
    ]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    prisma.activity.update.mockResolvedValue({ id: 'activity-1' });
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: 'activity-1', mediaProcessingStatus: 'queued' },
      data: { mediaProcessingStatus: 'processing' },
    });
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: {
        mapPhotoUrlBlurhash: null,
        mediaProcessingStatus: 'completed',
      },
    });
    expect(prisma.activityMedia.updateMany).toHaveBeenCalledWith({
      where: { activityId: 'activity-1', position: 0 },
      data: { blurhash: null },
    });
  });

  it('does not overwrite an existing blurhash', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityMediaProcessingService(prisma as never);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
    prisma.activity.findMany.mockResolvedValue([
      {
        id: 'activity-1',
        media: [{ position: 0, url: 'photo', thumbnail: null, blurhash: 'existing' }],
        mapPhotoUrl: null,
        mapPhotoUrlBlurhash: null,
      },
    ]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    prisma.activity.update.mockResolvedValue({ id: 'activity-1' });

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: { mediaProcessingStatus: 'completed' },
    });
  });

  it('keeps malformed and already processed photos unchanged', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityMediaProcessingService(prisma as never);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
    prisma.activity.findMany.mockResolvedValue([
      {
        id: 'activity-1',
        media: [
          { position: 0, url: 'existing', thumbnail: null, blurhash: 'blurhash' },
          { position: 1, url: 'new', thumbnail: 'thumb', blurhash: null },
        ],
        mapPhotoUrl: 'map',
        mapPhotoUrlBlurhash: 'map-blurhash',
      },
    ]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    prisma.activity.update.mockResolvedValue({ id: 'activity-1' });

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledWith('thumb', expect.any(Object));
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: {
        mediaProcessingStatus: 'completed',
      },
    });
    expect(prisma.activityMedia.updateMany).toHaveBeenCalledWith({
      where: { activityId: 'activity-1', position: 1 },
      data: { blurhash: null },
    });
  });

  it('requeues an activity when media processing fails with an Error', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityMediaProcessingService(prisma as never);
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('image unavailable'));
    prisma.activity.findMany.mockResolvedValue([
      { id: 'activity-1', media: [], mapPhotoUrl: null, mapPhotoUrlBlurhash: null },
    ]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    prisma.activity.update.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(prisma.activity.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'activity-1', mediaProcessingStatus: 'processing' },
      data: { mediaProcessingStatus: 'queued' },
    });
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: expect.objectContaining({ mediaProcessingStatus: 'completed' }),
    });
  });

  it('handles non-Error failures while requeuing an activity', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityMediaProcessingService(prisma as never);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
    prisma.activity.findMany.mockResolvedValue([
      { id: 'activity-1', media: [], mapPhotoUrl: null, mapPhotoUrlBlurhash: null },
    ]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    prisma.activity.update.mockRejectedValueOnce('database unavailable');

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(prisma.activity.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'activity-1', mediaProcessingStatus: 'processing' },
      data: { mediaProcessingStatus: 'queued' },
    });
  });

  it('skips an activity claimed by another worker', async () => {
    const prisma = createPrismaMock();
    const service = new ActivityMediaProcessingService(prisma as never);
    prisma.activity.findMany.mockResolvedValue([
      {
        id: 'activity-1',
        media: [{ position: 0, url: 'photo', thumbnail: null, blurhash: null }],
        mapPhotoUrl: null,
        mapPhotoUrlBlurhash: null,
      },
    ]);
    prisma.activity.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(prisma.activity.update).not.toHaveBeenCalled();
  });
});
