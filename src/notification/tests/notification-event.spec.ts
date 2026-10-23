import { jest } from '@jest/globals';
import { createNotificationEvent } from '../notification-event';
import { PUSH_NOTIFICATION_JOB_STATUS } from '../notification.constants';

function createTransaction(preferences: Record<string, unknown> = {}) {
  return {
    notification: { create: jest.fn(async () => ({ id: 'notification-1' })) },
    profile: {
      findUnique: jest.fn(async () => ({
        emailNotifications: false,
        inAppNotifications: true,
        pushNotifications: false,
        user: { email: null },
        ...preferences,
      })),
    },
    emailNotificationJob: { create: jest.fn(async () => ({ id: 'email-job-1' })) },
    pushNotificationJob: { create: jest.fn(async () => ({ id: 'job-1' })) },
  };
}

const input = {
  recipientUserId: 'recipient-1',
  actorUserId: 'actor-1',
  type: 'activity-like' as const,
  emailNotificationType: 'activity-like' as const,
  sourceId: 'like-1',
  targetType: 'activity',
  targetId: 'activity-1',
};

describe('createNotificationEvent', () => {
  it.each([
    { ...input, recipientUserId: '' },
    { ...input, recipientUserId: 'actor-1' },
  ])('does not create an event for an empty or self recipient', async (event) => {
    const transaction = createTransaction();
    await expect(createNotificationEvent(transaction as never, event)).resolves.toBeNull();
    expect(transaction.notification.create).not.toHaveBeenCalled();
    expect(transaction.emailNotificationJob.create).not.toHaveBeenCalled();
  });

  it('stores only in-app events when that channel is enabled', async () => {
    const transaction = createTransaction({ inAppNotifications: true });
    await expect(createNotificationEvent(transaction as never, input)).resolves.toEqual({ id: 'notification-1' });
    expect(transaction.pushNotificationJob.create).not.toHaveBeenCalled();
    expect(transaction.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inApp: true }),
      }),
    );
  });

  it('queues push based on preference without requiring a token and keeps it out of the in-app feed', async () => {
    const transaction = createTransaction({ inAppNotifications: false, pushNotifications: true });
    const content = 'x'.repeat(1100);
    await createNotificationEvent(transaction as never, { ...input, content, relatedId: 'comment-1' });

    expect(transaction.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inApp: false, relatedId: 'comment-1', content: 'x'.repeat(1000) }),
      }),
    );
    expect(transaction.pushNotificationJob.create).toHaveBeenCalledWith({
      data: { notificationId: 'notification-1', status: PUSH_NOTIFICATION_JOB_STATUS.queued },
    });
  });

  it('queues email only when the preference and recipient email are present', async () => {
    const transaction = createTransaction({
      inAppNotifications: false,
      pushNotifications: false,
      emailNotifications: true,
      user: { email: 'recipient@example.com' },
    });

    await expect(createNotificationEvent(transaction as never, input)).resolves.toBeNull();

    expect(transaction.emailNotificationJob.create).toHaveBeenCalledWith({
      data: { notificationType: 'activity-like', sourceId: 'like-1', status: 'queued' },
    });
    expect(transaction.notification.create).not.toHaveBeenCalled();
  });

  it('delivers mandatory moderation notifications when notification preferences are disabled', async () => {
    const transaction = createTransaction({
      emailNotifications: false,
      inAppNotifications: false,
      pushNotifications: true,
      user: { email: 'reporter@example.com', emailConfirmedAt: new Date() },
    });
    const event = {
      ...input,
      type: 'moderation-report-received' as const,
      emailNotificationType: 'reporter-receipt' as const,
      mandatory: true,
    };

    await expect(createNotificationEvent(transaction as never, event)).resolves.toEqual({ id: 'notification-1' });

    expect(transaction.emailNotificationJob.create).toHaveBeenCalledWith({
      data: { notificationType: 'reporter-receipt', sourceId: 'like-1', status: 'queued' },
    });
    expect(transaction.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ inApp: true }) }),
    );
    expect(transaction.pushNotificationJob.create).not.toHaveBeenCalled();
  });

  it('uses localized notification copy for the recipient language', async () => {
    const transaction = createTransaction({ language: 'russian' });

    await createNotificationEvent(transaction as never, {
      ...input,
      localizedContent: { russian: 'Жалоба получена', english: 'Report received' },
    });

    expect(transaction.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ content: 'Жалоба получена' }) }),
    );
  });
});
