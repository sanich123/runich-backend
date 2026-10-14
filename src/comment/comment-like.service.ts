import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { isUniqueConstraintError } from 'src/common/utils/database-errors';
import { EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import { NOTIFICATION_TYPE } from 'src/notification/notification.constants';
import { createNotificationEvent } from 'src/notification/notification-event';

@Injectable()
export class CommentLikeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(data: { profileId: string; authorId: string; commentId: string }) {
    const where = { authorId_commentId: { authorId: data.authorId, commentId: data.commentId } };
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const commentLike = await transaction.commentLike.create({ data });
        const comment = await transaction.comment.findUnique({
          where: { id: data.commentId },
          select: { authorId: true, comment: true, activityId: true },
        });
        if (comment) {
          const actor = await transaction.profile.findUnique({
            where: { id: data.profileId },
            select: { name: true, surname: true, profilePhoto: true },
          });
          await createNotificationEvent(transaction, {
            recipientUserId: comment.authorId,
            actorUserId: data.authorId,
            type: NOTIFICATION_TYPE.commentLike,
            emailNotificationType: EMAIL_NOTIFICATION_TYPE.commentLike,
            sourceId: commentLike.id,
            targetType: 'activity',
            targetId: comment.activityId,
            relatedId: data.commentId,
            actorName: actor?.name,
            actorSurname: actor?.surname,
            actorProfilePhoto: actor?.profilePhoto,
            content: comment.comment,
          });
        }
        return commentLike;
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      return this.prisma.commentLike.findUnique({ where });
    }
  }

  delete(id: string, authorId?: string) {
    return this.prisma.commentLike.delete({ where: authorId ? { id, authorId } : { id } });
  }

  findByCommentId(commentId: string) {
    return this.prisma.commentLike.findMany({ where: { commentId }, select: { authorId: true, id: true } });
  }
}
