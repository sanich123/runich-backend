import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/prisma-errors';
import { CommentDTO, CommentLikeDto } from './comment.dto';
import { AccountService } from 'src/account/account.service';
import { ActivityService } from 'src/activity/activity.service';
import { CommentLikeService } from './comment-like.service';

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

  async getCommentsbyActivityId(id: string, take = '10') {
    try {
      const allCommentsLength = await this.prisma.comment.count({ where: { activityId: id } });
      const takenComments = await this.prisma.comment.findMany({
        where: { activityId: id },
        orderBy: { date: 'desc' },
        include: {
          profile: {
            select: {
              surname: true,
              name: true,
              profilePhoto: true,
              profilePhotoBlurhash: true,
              emailNotifications: true,
              users: { select: { email: true } },
            },
          },
          commentLike: {
            select: {
              authorId: true,
              id: true,
            },
          },
        },
        take: Number(take),
      });
      return {
        comments: takenComments,
        allCommentsLength,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getCommentsLengthbyActivityId(id: string) {
    try {
      return await this.prisma.comment.count({ where: { activityId: id } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createCommentByActivityId({ comment }: CommentDTO, id: string, currentUserId?: string) {
    try {
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

  async getCommentByCommentId(id: string) {
    try {
      const comment = await this.prisma.comment.findUnique({
        where: { id },
        include: {
          profile: {
            include: {
              users: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      });
      return { profile: comment?.profile, email: comment?.profile.users.email, comment: comment?.comment };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createCommentLikeByCommentId({ commentId }: CommentLikeDto, currentUserId?: string) {
    try {
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

  async getCommentLikesLengthByCommentId(id: string) {
    try {
      return await this.commentLikeService.findByCommentId(id);
    } catch (error) {
      handleServiceError(error);
    }
  }
}
