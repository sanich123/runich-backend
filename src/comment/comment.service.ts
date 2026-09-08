import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { CommentDTO, CommentLikeDto } from './comment.dto';
import { AccountService } from 'src/account/account.service';
import { ActivityService } from 'src/activity/activity.service';
import { CommentLikeService } from './comment-like.service';
import { encodeCommentCursor } from './comment.pagination';
import type { CommentCursor } from './comment.pagination';

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
      select: { activityId: true },
    });
    if (!comment || !(await this.activityService.canAccessActivity(comment.activityId, currentUserId))) {
      throw new NotFoundException('Комментарий не найден');
    }
  }

  async getCommentsbyActivityId(id: string, limit = '10', cursor?: CommentCursor, currentUserId?: string) {
    try {
      await this.ensureActivityAccess(id, currentUserId);
      const pageSize = Number(limit);
      const commentsWithExtraItem = await this.prisma.comment.findMany({
        where: {
          activityId: id,
          ...(cursor
            ? {
                OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
              }
            : {}),
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        include: {
          profile: {
            select: {
              surname: true,
              name: true,
              profilePhoto: true,
              profilePhotoBlurhash: true,
              emailNotifications: true,
              user: { select: { email: true } },
            },
          },
          commentLike: {
            select: {
              authorId: true,
              id: true,
            },
          },
        },
        take: pageSize + 1,
      });
      const hasMore = commentsWithExtraItem.length > pageSize;
      const comments = commentsWithExtraItem.slice(0, pageSize);
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
      return await this.prisma.comment.count({ where: { activityId: id } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createCommentByActivityId({ comment }: CommentDTO, id: string, currentUserId?: string) {
    try {
      await this.ensureActivityAccess(id, currentUserId);
      const account = await this.accountService.getAccountByUserId(currentUserId ?? '');
      if (!account?.id) throw new NotFoundException('Профиль автора не найден: authorId');
      await this.prisma.comment.create({
        data: {
          profileId: account.id,
          activityId: id,
          authorId: currentUserId ?? '',
          comment,
        },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteCommentByCommentId(id: string, authorId?: string) {
    try {
      return await this.prisma.comment.delete({ where: authorId ? { id, authorId } : { id } });
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
      await this.ensureCommentAccess(id, currentUserId);
      const comment = await this.prisma.comment.findUnique({
        where: { id },
        include: {
          profile: {
            include: {
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      });
      return { profile: comment?.profile, email: comment?.profile.user.email, comment: comment?.comment };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createCommentLikeByCommentId({ commentId }: CommentLikeDto, currentUserId?: string) {
    try {
      await this.ensureCommentAccess(commentId, currentUserId);
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
      await this.ensureCommentAccess(id, currentUserId);
      return await this.commentLikeService.findByCommentId(id);
    } catch (error) {
      handleServiceError(error);
    }
  }
}
