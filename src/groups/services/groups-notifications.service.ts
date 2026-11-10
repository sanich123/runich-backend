import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { createNotificationEvent } from 'src/notification/notification-event';
import { NOTIFICATION_TYPE } from 'src/notification/notification.constants';

@Injectable()
export class GroupsNotificationsService {
  async notifyGroupMembers(
    transaction: PrismaService,
    notification: {
      groupId: string;
      groupName: string;
      sourceId: string;
      actorUserId: string;
      isAnnouncement: boolean;
      kind: 'post' | 'event';
      content: string;
    },
  ) {
    const recipients: Array<{ userId: string; notificationPreference: 'all' | 'announcements' | 'off' }> =
      await transaction.groupMember.findMany({
        where: { groupId: notification.groupId, status: 'active', userId: { not: notification.actorUserId } },
        select: { userId: true, notificationPreference: true },
      });
    if (!recipients.length) return;

    const actor = await transaction.profile.findUnique({
      where: { userId: notification.actorUserId },
      select: { name: true, surname: true, profilePhoto: true, hideProfilePhotos: true },
    });
    const isPost = notification.kind === 'post';
    const eventType = isPost ? NOTIFICATION_TYPE.groupPost : NOTIFICATION_TYPE.groupEvent;
    const categoryPreference = isPost ? 'groupPostsNotifications' : 'groupEventsNotifications';
    const localizedContent = isPost
      ? {
          russian: `Новая запись в группе «${notification.groupName}»: ${notification.content}`,
          english: `New post in “${notification.groupName}”: ${notification.content}`,
        }
      : {
          russian: `Новое событие в группе «${notification.groupName}»: ${notification.content}`,
          english: `New event in “${notification.groupName}”: ${notification.content}`,
        };

    for (const { userId, notificationPreference } of recipients) {
      if (
        notificationPreference === 'off' ||
        (notificationPreference === 'announcements' && !notification.isAnnouncement)
      ) {
        continue;
      }
      await createNotificationEvent(transaction, {
        recipientUserId: userId,
        actorUserId: notification.actorUserId,
        type: eventType,
        sourceId: notification.sourceId,
        targetType: isPost ? 'group-post' : 'group-event',
        targetId: notification.groupId,
        relatedId: notification.sourceId,
        actorName: actor?.name,
        actorSurname: actor?.surname,
        actorProfilePhoto: actor?.hideProfilePhotos ? null : actor?.profilePhoto,
        localizedContent,
        categoryPreference,
      });
    }
  }
}
