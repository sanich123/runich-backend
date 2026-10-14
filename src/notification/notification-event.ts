import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EMAIL_NOTIFICATION_JOB_STATUS } from 'src/email/email-notification.constants';
import { PUSH_NOTIFICATION_JOB_STATUS } from './notification.constants';
import type { NotificationEventInput } from './notification.types';

export async function createNotificationEvent(transaction: PrismaService, input: NotificationEventInput) {
  if (!input.recipientUserId || input.recipientUserId === input.actorUserId) return null;

  const recipient = await transaction.profile.findUnique({
    where: { userId: input.recipientUserId },
    select: {
      emailNotifications: true,
      inAppNotifications: true,
      pushNotifications: true,
      user: { select: { email: true } },
    },
  });
  if (!recipient) return null;

  if (input.emailNotificationType && recipient.emailNotifications === true && recipient.user?.email) {
    await transaction.emailNotificationJob.create({
      data: {
        notificationType: input.emailNotificationType,
        sourceId: input.sourceId,
        status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
      },
    });
  }

  const pushEnabled = recipient.pushNotifications === true;
  const inAppEnabled = recipient.inAppNotifications;
  if (!inAppEnabled && !pushEnabled) return null;

  const notification = await transaction.notification.create({
    data: {
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      type: input.type,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
      relatedId: input.relatedId,
      actorName: input.actorName,
      actorSurname: input.actorSurname,
      actorProfilePhoto: input.actorProfilePhoto,
      content: input.content?.slice(0, 1000),
      inApp: inAppEnabled,
    },
    select: { id: true },
  });

  if (pushEnabled) {
    await transaction.pushNotificationJob.create({
      data: { notificationId: notification.id, status: PUSH_NOTIFICATION_JOB_STATUS.queued },
    });
  }

  return notification;
}
