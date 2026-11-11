import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EmailNotificationService } from './email-notification.service';

export async function resolveGroupJoinRequestNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const request = await prisma.groupMember.findUnique({
    where: { id: sourceId },
    select: {
      status: true,
      user: { select: { profile: { select: { name: true, surname: true } } } },
      group: {
        select: {
          id: true,
          name: true,
          creator: {
            select: {
              email: true,
              profile: { select: { name: true, language: true } },
            },
          },
        },
      },
    },
  });
  if (!request || request.status !== 'pending' || !request.group.creator.email) return null;
  const requesterName =
    [request.user.profile?.name, request.user.profile?.surname].filter(Boolean).join(' ') || 'Runich user';
  const owner = request.group.creator;
  return {
    send: () =>
      notifications.sendGroupJoinRequest({
        groupId: request.group.id,
        groupName: request.group.name,
        requesterName,
        recipientEmail: owner.email,
        recipientName: owner.profile?.name,
        locale: owner.profile?.language === 'russian' ? 'russian' : 'english',
      }),
  };
}
