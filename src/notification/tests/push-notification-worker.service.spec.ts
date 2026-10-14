import { jest } from '@jest/globals';
import { asyncMock } from 'src/tests/helpers';
import { PushNotificationWorkerService } from '../push-notification-worker.service';
import type { ExpoPushMessage } from '../notification.types';

describe('PushNotificationWorkerService', () => {
  const prisma = {
    pushNotificationJob: { findFirst: asyncMock(), updateMany: asyncMock(), update: asyncMock() },
    notification: { findUnique: asyncMock() },
    pushDeviceToken: { findMany: asyncMock(), updateMany: asyncMock() },
  };
  const push = {
    send: jest.fn<(messages: ExpoPushMessage[]) => Promise<unknown>>(),
    logPermanentFailure: jest.fn(),
  };
  const worker = new PushNotificationWorkerService(prisma as never, push as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.pushNotificationJob.findFirst.mockResolvedValue({
      id: 'job-1',
      notificationId: 'notification-1',
      attempts: 0,
    });
    prisma.pushNotificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.pushNotificationJob.update.mockResolvedValue({});
    prisma.notification.findUnique.mockResolvedValue({
      id: 'notification-1',
      recipientUserId: 'recipient-1',
      type: 'comment',
      targetType: 'activity',
      targetId: 'activity-1',
      relatedId: 'comment-1',
      actorName: 'Alice',
      actorSurname: 'Runner',
      content: 'Nice run!',
      recipient: { profile: { pushNotifications: true } },
    });
    prisma.pushDeviceToken.findMany.mockResolvedValue([{ id: 'device-1', token: 'ExpoPushToken[device-1]' }]);
    prisma.pushDeviceToken.updateMany.mockResolvedValue({ count: 1 });
    push.send.mockResolvedValue([{ status: 'ok' }]);
  });

  it('sends a notification payload to active devices and completes the job', async () => {
    await expect(worker.processNextJob()).resolves.toBe(true);

    expect(push.send).toHaveBeenCalledWith([
      expect.objectContaining({
        to: 'ExpoPushToken[device-1]',
        title: 'Alice Runner прокомментировал(а) тренировку',
        body: 'Nice run!',
        data: {
          notificationId: 'notification-1',
          targetType: 'activity',
          targetId: 'activity-1',
          relatedId: 'comment-1',
        },
      }),
    ]);
    expect(prisma.pushNotificationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'sent', finishedAt: expect.any(Date) }),
      }),
    );
  });

  it('deactivates Expo tokens reported as unregistered', async () => {
    push.send.mockResolvedValue([{ status: 'error', details: { error: 'DeviceNotRegistered' } }]);

    await worker.processNextJob();

    expect(prisma.pushDeviceToken.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['device-1'] } },
      data: { active: false, updatedAt: expect.any(Date) },
    });
    expect(prisma.pushNotificationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent' }),
      }),
    );
  });

  it('retries transient delivery failures without failing the source action', async () => {
    push.send.mockRejectedValue(new Error('Expo temporarily unavailable'));

    await worker.processNextJob();

    expect(prisma.pushNotificationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'queued', errorMessage: 'Expo temporarily unavailable' }),
      }),
    );
    expect(prisma.pushNotificationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: 1, status: 'processing' }),
      }),
    );
  });

  it('returns early when there is no job or another worker claimed it first', async () => {
    prisma.pushNotificationJob.findFirst.mockResolvedValueOnce(null);
    await expect(worker.processNextJob()).resolves.toBe(false);

    prisma.pushNotificationJob.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(worker.processNextJob()).resolves.toBe(true);
    expect(prisma.notification.findUnique).not.toHaveBeenCalled();
  });

  it('skips jobs whose notification or active-device list has disappeared', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce(null);
    await worker.processNextJob();
    expect(prisma.pushNotificationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'skipped' }),
      }),
    );

    prisma.pushDeviceToken.findMany.mockResolvedValueOnce([]);
    await worker.processNextJob();
    expect(prisma.pushNotificationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'skipped' }),
      }),
    );
  });

  it('skips a queued push when the user has since disabled push notifications', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce({
      id: 'notification-1',
      recipientUserId: 'recipient-1',
      type: 'comment',
      targetType: 'activity',
      targetId: 'activity-1',
      recipient: { profile: { pushNotifications: false } },
    });

    await worker.processNextJob();

    expect(prisma.pushDeviceToken.findMany).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(prisma.pushNotificationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'skipped' }),
      }),
    );
  });

  it('batches more than 100 devices and uses generic copy when notification fields are absent', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce({
      id: 'notification-1',
      recipientUserId: 'recipient-1',
      type: 'other',
      targetType: 'activity',
      targetId: 'activity-1',
      relatedId: null,
      actorName: null,
      actorSurname: null,
      content: null,
      recipient: { profile: { pushNotifications: true } },
    });
    prisma.pushDeviceToken.findMany.mockResolvedValueOnce(
      Array.from({ length: 101 }, (_, index) => ({
        id: `device-${index}`,
        token: `ExpoPushToken[${index}]`,
      })),
    );
    push.send.mockResolvedValue([{ status: 'ok' }]);

    await worker.processNextJob();

    expect(push.send).toHaveBeenCalledTimes(2);
    expect(push.send).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Новое уведомление',
          body: 'Откройте приложение, чтобы посмотреть подробности.',
        }),
      ]),
    );
    expect(push.send.mock.calls[0][0]).toHaveLength(100);
    expect(push.send.mock.calls[1][0]).toHaveLength(1);
  });

  it('marks exhausted retries as failed and reports the permanent failure', async () => {
    prisma.pushNotificationJob.findFirst.mockResolvedValueOnce({
      id: 'job-1',
      notificationId: 'notification-1',
      attempts: 4,
    });
    push.send.mockRejectedValueOnce('offline');

    await worker.processNextJob();

    expect(prisma.pushNotificationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', errorMessage: 'offline', finishedAt: expect.any(Date) }),
      }),
    );
    expect(push.logPermanentFailure).toHaveBeenCalledWith('job-1', 'offline');
  });

  it.each([
    [{ status: 'error', message: 'ticket message', details: { error: 'details code' } }, 'ticket message'],
    [{ status: 'error', details: { error: 'details code' } }, 'details code'],
    [{ status: 'error' }, 'Expo Push ticket failed'],
  ])('retries an unsuccessful Expo ticket and uses the best available error text', async (ticket, message) => {
    push.send.mockResolvedValueOnce([ticket]);
    await worker.processNextJob();
    expect(prisma.pushNotificationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'queued', errorMessage: message }),
      }),
    );
  });
});
