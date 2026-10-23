import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { asyncMock } from 'src/tests/helpers';
import { NotificationService } from '../notification.service';
import { MANDATORY_NOTIFICATION_TYPES } from '../notification.constants';

describe('NotificationService', () => {
  const transaction = {
    pushDeviceToken: { updateMany: asyncMock(), findFirst: asyncMock(), update: asyncMock(), create: asyncMock() },
  };
  const prisma = {
    notification: { findMany: asyncMock(), count: asyncMock(), updateMany: asyncMock(), findFirst: asyncMock() },
    pushDeviceToken: { findFirst: asyncMock(), updateMany: asyncMock() },
    $transaction: jest.fn(async (operation: (client: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const service = new NotificationService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('lists notifications with a stable cursor and returns one extra row only to determine hasMore', async () => {
    const date = new Date('2026-10-14T10:00:00.000Z');
    prisma.notification.findMany.mockResolvedValue([
      { id: 'notification-2', createdAt: date },
      { id: 'notification-1', createdAt: date },
    ]);

    const result = await service.list('recipient-1', '1');

    expect(result).toMatchObject({
      notifications: [{ id: 'notification-2' }],
      hasMore: true,
      nextCursor: expect.any(String),
    });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipientUserId: 'recipient-1',
          inApp: true,
          AND: [
            {
              OR: [
                { recipient: { profile: { inAppNotifications: true } } },
                { type: { in: [...MANDATORY_NOTIFICATION_TYPES] } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
    );
  });

  it('uses the default page size, clamps oversized requests, and returns no cursor for a final page', async () => {
    prisma.notification.findMany.mockResolvedValue([]);

    await expect(service.list('recipient-1')).resolves.toEqual({ notifications: [], hasMore: false, nextCursor: null });
    expect(prisma.notification.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 31 }));

    await service.list(
      'recipient-1',
      '500',
      'eyJjcmVhdGVkQXQiOiIyMDI2LTEwLTE0VDEwOjAwOjAwLjAwMFoiLCJpZCI6ImN1cnNvci0xIn0',
    );
    expect(prisma.notification.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        take: 51,
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { recipient: { profile: { inAppNotifications: true } } },
                { type: { in: [...MANDATORY_NOTIFICATION_TYPES] } },
              ],
            },
            {
              OR: [
                { createdAt: { lt: new Date('2026-10-14T10:00:00.000Z') } },
                { createdAt: new Date('2026-10-14T10:00:00.000Z'), id: { lt: 'cursor-1' } },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it.each(['0', '-1', '1.5', 'invalid'])('rejects invalid page size %s', async (take) => {
    await expect(service.list('recipient-1', take)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes unread count and read-all updates to the authenticated recipient', async () => {
    prisma.notification.count.mockResolvedValue(4);
    prisma.notification.updateMany.mockResolvedValue({ count: 4 });

    await expect(service.unreadCount('recipient-1')).resolves.toBe(4);
    await expect(service.markAllRead('recipient-1')).resolves.toEqual({ updated: 4 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: {
        recipientUserId: 'recipient-1',
        inApp: true,
        readAt: null,
        OR: [
          { recipient: { profile: { inAppNotifications: true } } },
          { type: { in: [...MANDATORY_NOTIFICATION_TYPES] } },
        ],
      },
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipientUserId: 'recipient-1',
          inApp: true,
          readAt: null,
          OR: [
            { recipient: { profile: { inAppNotifications: true } } },
            { type: { in: [...MANDATORY_NOTIFICATION_TYPES] } },
          ],
        },
        data: { readAt: expect.any(Date) },
      }),
    );
  });

  it('does not allow a user to mark another user notification as read', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prisma.notification.findFirst.mockResolvedValue(null);

    await expect(service.markRead('recipient-1', 'other-users-notification')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'other-users-notification', recipientUserId: 'recipient-1', readAt: null },
      }),
    );
  });

  it('treats an already-read owned notification as success and reports not found only when it is not owned', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prisma.notification.findFirst.mockResolvedValue({ id: 'notification-1' });
    await expect(service.markRead('recipient-1', 'notification-1')).resolves.toEqual({ updated: 0 });

    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.markRead('recipient-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks a new notification as read', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.markRead('recipient-1', 'notification-1')).resolves.toEqual({ updated: 1 });
  });

  it('registers the Expo token for this device and deactivates its previous token', async () => {
    transaction.pushDeviceToken.updateMany.mockResolvedValue({ count: 1 });
    transaction.pushDeviceToken.findFirst.mockResolvedValue(null);
    transaction.pushDeviceToken.create.mockResolvedValue({ id: 'device-token-1' });

    await expect(
      service.registerPushToken('user-1', 'device-1', {
        token: 'ExpoPushToken[device-token]',
        platform: 'android',
      }),
    ).resolves.toEqual({ enabled: true });

    expect(transaction.pushDeviceToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deviceId: 'device-1', active: true },
      data: { active: false, updatedAt: expect.any(Date) },
    });
    expect(transaction.pushDeviceToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        deviceId: 'device-1',
        token: 'ExpoPushToken[device-token]',
        platform: 'android',
        active: true,
        updatedAt: expect.any(Date),
      },
    });
  });

  it('updates an existing Expo token and rejects invalid device identifiers', async () => {
    transaction.pushDeviceToken.findFirst.mockResolvedValue({ id: 'existing-token' });

    await expect(
      service.registerPushToken('user-1', 'device-1', {
        token: 'ExpoPushToken[device-token]',
        platform: 'android',
      }),
    ).resolves.toEqual({ enabled: true });
    expect(transaction.pushDeviceToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-token' },
        data: expect.objectContaining({ userId: 'user-1', deviceId: 'device-1', active: true }),
      }),
    );

    await expect(service.getPushTokenStatus('user-1', '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.unregisterPushToken('user-1', 'x'.repeat(129))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns push-token state and disables only active tokens for the current device', async () => {
    prisma.pushDeviceToken.findFirst.mockResolvedValue({ id: 'device-token' });
    prisma.pushDeviceToken.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.getPushTokenStatus('user-1', 'device-1')).resolves.toEqual({ enabled: true });
    await expect(service.unregisterPushToken('user-1', 'device-1')).resolves.toEqual({ enabled: false, updated: 1 });
    expect(prisma.pushDeviceToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', deviceId: 'device-1', active: true },
      }),
    );
  });
});
