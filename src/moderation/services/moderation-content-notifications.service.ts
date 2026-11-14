import { Injectable } from '@nestjs/common';
import { EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { notifyGroupMembers } from 'src/groups/services/groups-notifications.utils';
import { createNotificationEvent } from 'src/notification/notification-event';
import { NOTIFICATION_TYPE } from 'src/notification/notification.constants';

@Injectable()
export class ModerationContentNotificationsService {
  async notifyPublishedComment(transaction: PrismaService, commentId: string) {
    const comment = await transaction.comment.findUnique({
      where: { id: commentId },
      select: {
        authorId: true,
        profile: { select: { name: true, surname: true, profilePhoto: true } },
        activity: { select: { id: true, userId: true } },
      },
    });
    if (!comment) return;

    await createNotificationEvent(transaction, {
      recipientUserId: comment.activity.userId,
      actorUserId: comment.authorId,
      type: NOTIFICATION_TYPE.comment,
      emailNotificationType: EMAIL_NOTIFICATION_TYPE.comment,
      sourceId: commentId,
      targetType: 'activity',
      targetId: comment.activity.id,
      relatedId: commentId,
      actorName: comment.profile.name,
      actorSurname: comment.profile.surname,
      actorProfilePhoto: comment.profile.profilePhoto,
      localizedContent: {
        russian: 'Новый комментарий к вашей тренировке.',
        english: 'A new comment on your activity.',
      },
    });
  }

  async notifyPublishedGroupPost(transaction: PrismaService, postId: string) {
    const post = await transaction.groupPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        text: true,
        createdByUserId: true,
        group: { select: { id: true, name: true, createdByUserId: true } },
      },
    });
    if (!post) return;

    const membership =
      post.group.createdByUserId === post.createdByUserId
        ? null
        : await transaction.groupMember.findUnique({
            where: { groupId_userId: { groupId: post.group.id, userId: post.createdByUserId } },
            select: { role: true, status: true },
          });
    const isAnnouncement =
      post.group.createdByUserId === post.createdByUserId ||
      (membership?.status === 'active' && (membership.role === 'admin' || membership.role === 'owner'));

    await notifyGroupMembers(transaction, {
      groupId: post.group.id,
      groupName: post.group.name,
      sourceId: post.id,
      actorUserId: post.createdByUserId,
      isAnnouncement,
      kind: 'post',
      content: post.text,
    });
  }
}
