import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { CommentDTO, CommentLikeDto } from './comment.dto';
import { AccountService } from 'src/account/account.service';
import { ActivityService } from 'src/activity/activity.service';
import { CommentLikeService } from './comment-like.service';
import { encodeCommentCursor } from './comment.pagination';
import type { CommentCursor } from './comment.pagination';
import { COMMENT_PROFILE_SELECT } from './const';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';

@Injectable()
export class CommentService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
    @Inject(CommentLikeService)
    commentLikeService?: CommentLikeService,
  ) {
    this.commentLikeService = commentLikeService ?? new CommentLikeService(this.prisma);
  }

  private readonly commentLikeService: CommentLikeService;

  private async ensureActivityAccess(activityId: string, currentUserId?: string) {
    if (currentUserId && !(await this.activityService.canAccessActivity(activityId, currentUserId))) {
      throw new NotFoundException('Активность не найдена');
    }
  }

  private async ensureCommentAccess(commentId: string, currentUserId?: string) {
    if (!currentUserId) return;

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { activity: { select: { id: true } } },
    });
    if (!comment || !(await this.activityService.canAccessActivity(comment.activity.id, currentUserId))) {
      throw new NotFoundException('Комментарий не найден');
    }
  }

  async getCommentsbyActivityId(id: string, limit = '10', cursor?: CommentCursor, currentUserId?: string) {
    try {
      await this.ensureActivityAccess(id, currentUserId);
      const pageSize = Number(limit);
      const activity = await this.prisma.activity.findUnique({
        where: { id },
        select: {
          comments: {
            ...(cursor
              ? {
                  where: {
                    OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
                  },
                }
              : {}),
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            select: {
              date: true,
              comment: true,
              authorId: true,
              activityId: true,
              profileId: true,
              id: true,
              profile: { select: COMMENT_PROFILE_SELECT },
              commentLikes: { select: { authorId: true, id: true } },
            },
            take: pageSize + 1,
          },
        },
      });
      if (!activity) {
        if (currentUserId) throw new NotFoundException('Активность не найдена');
        return { comments: [], hasMore: false, nextCursor: null };
      }
      const commentsWithExtraItem = activity.comments;
      const hasMore = commentsWithExtraItem.length > pageSize;
      const comments = commentsWithExtraItem.slice(0, pageSize).map((value: Record<string, unknown>) => {
        const { commentLikes, ...comment } = value;
        return { ...comment, commentLike: commentLikes ?? [] };
      });
      return {
        comments,
        hasMore,
        nextCursor: hasMore && comments.length ? encodeCommentCursor(comments.at(-1)!) : null,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getCommentsLengthbyActivityId(id: string, currentUserId?: string) {
    try {
      await this.ensureActivityAccess(id, currentUserId);
      const activity = await this.prisma.activity.findUnique({
        where: { id },
        select: { _count: { select: { comments: true } } },
      });
      if (!activity) {
        if (currentUserId) throw new NotFoundException('Активность не найдена');
        return 0;
      }
      return activity._count.comments;
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createCommentByActivityId({ comment }: CommentDTO, id: string, currentUserId?: string) {
    try {
      await this.ensureActivityAccess(id, currentUserId);
      if (currentUserId && !(await this.activityService.canInteractWithActivity(id, currentUserId))) {
        throw new ForbiddenException('Владелец активности запретил лайки и комментарии');
      }
      const account = await this.accountService.getAccountByUserId(currentUserId ?? '');
      if (!account?.id) throw new NotFoundException('Профиль автора не найден: authorId');
      await this.prisma.$transaction(async (transaction) => {
        const createdComment = await transaction.comment.create({
          data: {
            profileId: account.id,
            activityId: id,
            authorId: currentUserId ?? '',
            comment,
          },
        });
        await transaction.emailNotificationJob.create({
          data: {
            notificationType: EMAIL_NOTIFICATION_TYPE.comment,
            sourceId: createdComment.id,
            status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
          },
        });
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteCommentByCommentId(id: string, authorId?: string) {
    try {
      if (!authorId) return await this.prisma.comment.delete({ where: { id } });

      const comment = await this.prisma.comment.findUnique({
        where: { id },
        select: { authorId: true, activity: { select: { userId: true } } },
      });
      if (!comment) throw new NotFoundException('Комментарий не найден');
      if (comment.authorId !== authorId && comment.activity.userId !== authorId) {
        throw new ForbiddenException('Недостаточно прав для удаления комментария');
      }
      return await this.prisma.comment.delete({ where: { id } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async updateCommentByCommentId(comment: string, id: string, authorId?: string) {
    try {
      return await this.prisma.comment.update({
        where: authorId ? { id, authorId } : { id },
        data: { comment },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getCommentByCommentId(id: string, currentUserId?: string) {
    try {
      const comment = await this.prisma.comment.findUnique({
        where: { id },
        select: {
          comment: true,
          profile: { select: COMMENT_PROFILE_SELECT },
          activity: { select: { id: true } },
        },
      });
      if (
        currentUserId &&
        (!comment || !(await this.activityService.canAccessActivity(comment.activity.id, currentUserId)))
      ) {
        throw new NotFoundException('Комментарий не найден');
      }
      return {
        profile: comment?.profile,
        comment: comment?.comment,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createCommentLikeByCommentId({ commentId }: CommentLikeDto, currentUserId?: string) {
    try {
      await this.ensureCommentAccess(commentId, currentUserId);
      if (currentUserId) {
        const comment = await this.prisma.comment.findUnique({
          where: { id: commentId },
          select: { activity: { select: { id: true } } },
        });
        if (!comment || !(await this.activityService.canInteractWithActivity(comment.activity.id, currentUserId))) {
          throw new ForbiddenException('Владелец активности запретил лайки и комментарии');
        }
      }
      const account = await this.accountService.getAccountByUserId(currentUserId ?? '');
      if (!account?.id) throw new NotFoundException('Профиль автора не найден: authorId');
      return await this.commentLikeService.create({ profileId: account.id, authorId: currentUserId ?? '', commentId });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteCommentLikeByLikeId(id: string, authorId?: string) {
    try {
      return await this.commentLikeService.delete(id, authorId);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getCommentLikesLengthByCommentId(id: string, currentUserId?: string) {
    try {
      const comment = await this.prisma.comment.findUnique({
        where: { id },
        select: {
          activity: { select: { id: true } },
          commentLikes: { select: { authorId: true, id: true } },
        },
      });
      if (
        currentUserId &&
        (!comment || !(await this.activityService.canAccessActivity(comment.activity.id, currentUserId)))
      ) {
        throw new NotFoundException('Комментарий не найден');
      }
      return comment?.commentLikes ?? [];
    } catch (error) {
      handleServiceError(error);
    }
  }
}
