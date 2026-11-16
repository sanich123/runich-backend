import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EmailNotificationService } from './email-notification.service';
import type { EmailNotificationPayload } from './email-notification.types';

export async function resolveActivityLikeNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const like = await prisma.like.findUnique({
    where: { id: sourceId },
    select: {
      authorId: true,
      profile: { select: { name: true, surname: true, profilePhoto: true } },
      activity: {
        select: {
          id: true,
          userId: true,
          mapPhotoUrl: true,
          profile: {
            select: {
              userId: true,
              name: true,
              surname: true,
              emailNotifications: true,
              user: { select: { email: true } },
            },
          },
        },
      },
    },
  });
  if (!like || like.authorId === like.activity.userId) return null;
  const payload = createActivityEmailNotificationPayload(like.profile, like.activity.profile, like.activity.id, {
    mapPhotoUrl: like.activity.mapPhotoUrl,
  });
  return payload ? { send: () => notifications.sendLike(payload) } : null;
}

export async function resolveCommentNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const comment = await prisma.comment.findUnique({
    where: { id: sourceId },
    select: {
      authorId: true,
      comment: true,
      profile: { select: { name: true, surname: true, profilePhoto: true } },
      activity: {
        select: {
          id: true,
          userId: true,
          mapPhotoUrl: true,
          profile: {
            select: {
              userId: true,
              name: true,
              surname: true,
              emailNotifications: true,
              user: { select: { email: true } },
            },
          },
        },
      },
    },
  });
  if (!comment || comment.authorId === comment.activity.userId) return null;
  const payload = createActivityEmailNotificationPayload(
    comment.profile,
    comment.activity.profile,
    comment.activity.id,
    {
      comment: comment.comment,
      mapPhotoUrl: comment.activity.mapPhotoUrl,
    },
  );
  return payload ? { send: () => notifications.sendComment(payload) } : null;
}

export async function resolveCommentLikeNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const commentLike = await prisma.commentLike.findUnique({
    where: { id: sourceId },
    select: {
      authorId: true,
      profile: { select: { name: true, surname: true, profilePhoto: true } },
      comment: {
        select: {
          authorId: true,
          comment: true,
          profile: {
            select: {
              userId: true,
              name: true,
              surname: true,
              emailNotifications: true,
              user: { select: { email: true } },
            },
          },
          activity: { select: { id: true } },
        },
      },
    },
  });
  if (!commentLike || commentLike.authorId === commentLike.comment.authorId) return null;
  const payload = createActivityEmailNotificationPayload(
    commentLike.profile,
    commentLike.comment.profile,
    commentLike.comment.activity.id,
    { comment: commentLike.comment.comment },
  );
  return payload ? { send: () => notifications.sendCommentLike(payload) } : null;
}

export function createActivityEmailNotificationPayload(
  actor: { name?: string | null; surname?: string | null; profilePhoto?: string | null } | null,
  recipient: {
    userId: string;
    name?: string | null;
    surname?: string | null;
    emailNotifications?: boolean | null;
    user?: { email?: string | null } | null;
  } | null,
  activityId: string,
  extra: { comment?: string; mapPhotoUrl?: string | null } = {},
): EmailNotificationPayload | null {
  if (!actor || !recipient || recipient.emailNotifications !== true || !recipient.user?.email) return null;

  return {
    activityId,
    actorName: actor.name,
    actorSurname: actor.surname,
    actorProfilePhoto: actor.profilePhoto,
    recipientEmail: recipient.user.email,
    recipientName: recipient.name,
    recipientSurname: recipient.surname,
    ...extra,
  };
}
