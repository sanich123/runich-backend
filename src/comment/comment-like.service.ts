import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { isUniqueConstraintError } from 'src/common/utils/database-errors';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';

@Injectable()
export class CommentLikeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(data: { profileId: string; authorId: string; commentId: string }) {
    const where = { authorId_commentId: { authorId: data.authorId, commentId: data.commentId } };
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const commentLike = await transaction.commentLike.create({ data });
        await transaction.emailNotificationJob.create({
          data: {
            notificationType: EMAIL_NOTIFICATION_TYPE.commentLike,
            sourceId: commentLike.id,
            status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
          },
        });
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
