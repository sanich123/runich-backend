import { jest } from '@jest/globals';
import { asyncMock } from 'src/tests/helpers';
import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

const createNotificationEvent = jest.fn(async () => ({ id: 'notification-1' }));

jest.unstable_mockModule('src/notification/notification-event', () => ({ createNotificationEvent }));

const { notifyGroupMembers } = await import('../services/groups-notifications.utils');

function createTransaction() {
  return {
    groupMember: { findMany: asyncMock() },
    profile: { findUnique: asyncMock() },
  };
}

const notification = {
  groupId: 'group-1',
  groupName: 'Run Club',
  sourceId: 'source-1',
  actorUserId: 'actor-1',
  isAnnouncement: false,
  kind: 'post' as const,
  content: 'Sunday run',
};

describe('notifyGroupMembers', () => {
  beforeEach(() => {
    createNotificationEvent.mockClear();
  });

  it('skips profile lookup and notification creation when there are no recipients', async () => {
    const transaction = createTransaction();
    transaction.groupMember.findMany.mockResolvedValue([]);

    await notifyGroupMembers(transaction as unknown as PrismaService, notification);

    expect(transaction.profile.findUnique).not.toHaveBeenCalled();
    expect(createNotificationEvent).not.toHaveBeenCalled();
  });

  it.each([
    {
      kind: 'post' as const,
      hideProfilePhotos: true,
      type: 'group-post',
      targetType: 'group-post',
      categoryPreference: 'groupPostsNotifications',
      russian: 'Новая запись в группе «Run Club»: Sunday run',
      english: 'New post in “Run Club”: Sunday run',
      actorProfilePhoto: null,
    },
    {
      kind: 'event' as const,
      hideProfilePhotos: false,
      type: 'group-event',
      targetType: 'group-event',
      categoryPreference: 'groupEventsNotifications',
      russian: 'Новое событие в группе «Run Club»: Sunday run',
      english: 'New event in “Run Club”: Sunday run',
      actorProfilePhoto: 'https://cdn.test/actor.webp',
    },
  ])('sends localized $kind notifications and respects profile-photo visibility', async (expected) => {
    const transaction = createTransaction();
    transaction.groupMember.findMany.mockResolvedValue([{ userId: 'member-1', notificationPreference: 'all' }]);
    transaction.profile.findUnique.mockResolvedValue({
      name: 'Alex',
      surname: 'Runner',
      profilePhoto: 'https://cdn.test/actor.webp',
      hideProfilePhotos: expected.hideProfilePhotos,
    });

    await notifyGroupMembers(transaction as unknown as PrismaService, { ...notification, kind: expected.kind });

    expect(createNotificationEvent).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        recipientUserId: 'member-1',
        actorUserId: 'actor-1',
        type: expected.type,
        sourceId: 'source-1',
        targetType: expected.targetType,
        targetId: 'group-1',
        relatedId: 'source-1',
        actorName: 'Alex',
        actorSurname: 'Runner',
        actorProfilePhoto: expected.actorProfilePhoto,
        localizedContent: { russian: expected.russian, english: expected.english },
        categoryPreference: expected.categoryPreference,
      }),
    );
  });
});
