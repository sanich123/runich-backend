import { jest } from '@jest/globals';
import { asyncMock } from 'src/tests/helpers';
import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

const createNotificationEvent = jest.fn(async () => ({ id: 'notification-1' }));

jest.unstable_mockModule('src/notification/notification-event', () => ({ createNotificationEvent }));

const { ModerationContentNotificationsService } = await import('../services/moderation-content-notifications.service');

function createTransaction() {
  return {
    comment: { findUnique: asyncMock() },
    groupPost: { findUnique: asyncMock() },
    groupMember: { findUnique: asyncMock(), findMany: asyncMock() },
    profile: { findUnique: asyncMock() },
  };
}

describe('ModerationContentNotificationsService', () => {
  const service = new ModerationContentNotificationsService();

  beforeEach(() => {
    createNotificationEvent.mockClear();
  });

  it('does not send a comment notification when the comment has disappeared', async () => {
    const transaction = createTransaction();
    transaction.comment.findUnique.mockResolvedValue(null);

    await service.notifyPublishedComment(transaction as unknown as PrismaService, 'comment-1');

    expect(createNotificationEvent).not.toHaveBeenCalled();
  });

  it('sends the activity owner a notification after a comment is published', async () => {
    const transaction = createTransaction();
    transaction.comment.findUnique.mockResolvedValue({
      authorId: 'commenter-1',
      profile: { name: 'Alex', surname: 'Runner', profilePhoto: 'https://cdn.test/alex.webp' },
      activity: { id: 'activity-1', userId: 'activity-owner-1' },
    });

    await service.notifyPublishedComment(transaction as unknown as PrismaService, 'comment-1');

    expect(createNotificationEvent).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        recipientUserId: 'activity-owner-1',
        actorUserId: 'commenter-1',
        type: 'comment',
        emailNotificationType: 'comment',
        sourceId: 'comment-1',
        targetType: 'activity',
        targetId: 'activity-1',
        relatedId: 'comment-1',
        actorName: 'Alex',
        actorSurname: 'Runner',
        actorProfilePhoto: 'https://cdn.test/alex.webp',
      }),
    );
  });

  it('does not send a group post notification when the post has disappeared', async () => {
    const transaction = createTransaction();
    transaction.groupPost.findUnique.mockResolvedValue(null);

    await service.notifyPublishedGroupPost(transaction as unknown as PrismaService, 'post-1');

    expect(transaction.groupMember.findUnique).not.toHaveBeenCalled();
    expect(transaction.groupMember.findMany).not.toHaveBeenCalled();
    expect(createNotificationEvent).not.toHaveBeenCalled();
  });

  it('treats the group creator as an announcement author without looking up membership', async () => {
    const transaction = createTransaction();
    transaction.groupPost.findUnique.mockResolvedValue({
      id: 'post-1',
      text: 'Sunday run',
      createdByUserId: 'group-owner-1',
      group: { id: 'group-1', name: 'Run Club', createdByUserId: 'group-owner-1' },
    });
    transaction.groupMember.findMany.mockResolvedValue([
      { userId: 'member-1', notificationPreference: 'announcements' },
    ]);
    transaction.profile.findUnique.mockResolvedValue({
      name: 'Owner',
      surname: 'Runner',
      profilePhoto: null,
      hideProfilePhotos: false,
    });

    await service.notifyPublishedGroupPost(transaction as unknown as PrismaService, 'post-1');

    expect(transaction.groupMember.findUnique).not.toHaveBeenCalled();
    expect(createNotificationEvent).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        recipientUserId: 'member-1',
        type: 'group-post',
        targetType: 'group-post',
        categoryPreference: 'groupPostsNotifications',
        localizedContent: {
          russian: 'Новая запись в группе «Run Club»: Sunday run',
          english: 'New post in “Run Club”: Sunday run',
        },
      }),
    );
  });

  it.each([
    { role: 'admin', status: 'active', shouldNotify: true },
    { role: 'owner', status: 'active', shouldNotify: true },
    { role: 'member', status: 'active', shouldNotify: false },
    { role: 'admin', status: 'left', shouldNotify: false },
  ])('applies announcement preferences for a $status $role member', async ({ role, status, shouldNotify }) => {
    const transaction = createTransaction();
    transaction.groupPost.findUnique.mockResolvedValue({
      id: 'post-2',
      text: 'Club update',
      createdByUserId: 'author-1',
      group: { id: 'group-2', name: 'Run Club', createdByUserId: 'group-owner-2' },
    });
    transaction.groupMember.findUnique.mockResolvedValue({ role, status });
    transaction.groupMember.findMany.mockResolvedValue([
      { userId: 'member-2', notificationPreference: 'announcements' },
    ]);
    transaction.profile.findUnique.mockResolvedValue({
      name: 'Author',
      surname: 'Runner',
      profilePhoto: null,
      hideProfilePhotos: false,
    });

    await service.notifyPublishedGroupPost(transaction as unknown as PrismaService, 'post-2');

    expect(createNotificationEvent).toHaveBeenCalledTimes(shouldNotify ? 1 : 0);
  });
});
