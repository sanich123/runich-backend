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

  async createCommentByActivityId({ comment, authorId }: CommentDTO, id: string) {
    try {
      const account = await this.accountService.getAccountByUserId(authorId);
      if (!account?.id) throw new NotFoundException('Профиль автора не найден: authorId');
      await this.prisma.comment.create({
        data: {
          profileId: account.id,
          activityId: id,
          authorId,
          comment,
        },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteCommentByCommentId(id: string) {
    try {
      return await this.prisma.comment.delete({ where: { id } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async updateCommentByCommentId(comment: string, id: string) {
    try {
      return await this.prisma.comment.update({
        where: { id },
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

  async createCommentLikeByCommentId({ commentId, authorId }: CommentLikeDto) {
    try {
      const account = await this.accountService.getAccountByUserId(authorId);
      if (!account?.id) throw new NotFoundException('Профиль автора не найден: authorId');
      return await this.commentLikeService.create({ profileId: account.id, authorId, commentId });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteCommentLikeByLikeId(id: string) {
    try {
      return await this.commentLikeService.delete(id);
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
