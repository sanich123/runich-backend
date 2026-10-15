import { NotificationController } from '../notification.controller';
import { jest } from '@jest/globals';

describe('NotificationController', () => {
  const notifications = {
    list: jest.fn(),
    unreadCount: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),
    getPushTokenStatus: jest.fn(),
    registerPushToken: jest.fn(),
    unregisterPushToken: jest.fn(),
  };
  const controller = new NotificationController(notifications as never);
  const request = { user: { id: 'fallback-user', userId: 'authenticated-user' }, get: jest.fn() } as never;

  beforeEach(() => jest.clearAllMocks());

  it('forwards feed, unread and read operations for the authenticated user', () => {
    controller.list(request, '20', 'cursor-1');
    controller.unreadCount(request);
    controller.markAllRead(request);
    controller.markRead(request, 'notification-1');

    expect(notifications.list).toHaveBeenCalledWith('authenticated-user', '20', 'cursor-1');
    expect(notifications.unreadCount).toHaveBeenCalledWith('authenticated-user');
    expect(notifications.markAllRead).toHaveBeenCalledWith('authenticated-user');
    expect(notifications.markRead).toHaveBeenCalledWith('authenticated-user', 'notification-1');
  });

  it('uses an empty device id when the header is absent and forwards a present device id', () => {
    (request as { get: jest.Mock }).get.mockReturnValue(undefined);
    controller.pushTokenStatus(request);
    controller.registerPushToken(request, { token: 'ExpoPushToken[token]', platform: 'android' } as never);
    controller.unregisterPushToken(request);
    expect(notifications.getPushTokenStatus).toHaveBeenCalledWith('authenticated-user', '');
    expect(notifications.registerPushToken).toHaveBeenCalledWith('authenticated-user', '', expect.any(Object));
    expect(notifications.unregisterPushToken).toHaveBeenCalledWith('authenticated-user', '');

    (request as { get: jest.Mock }).get.mockReturnValue('device-1');
    controller.pushTokenStatus(request);
    expect(notifications.getPushTokenStatus).toHaveBeenLastCalledWith('authenticated-user', 'device-1');
  });
});
