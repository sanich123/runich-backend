import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { prismaErrorHandling } from 'src/common/utils/prisma-errors';
import { CommentDTO, CommentLikeDto } from './comment.dto';
import { AccountService } from 'src/account/account.service';
import { ActivityService } from 'src/activity/activity.service';

@Injectable()
export class CommentService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
  ) {}

  async getCommentsbyActivityId(id: string, take: string) {
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
      prismaErrorHandling(error);
    }
  }

  async getCommentsLengthbyActivityId(id: string) {
    try {
      return await this.prisma.comment.count({ where: { activityId: id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createCommentByActivityId({ comment, authorId }: CommentDTO, id: string) {
    try {
      const account = await this.accountService.getAccountByUserId(authorId);
      if (!account?.id) throw new NotFoundException();
      await this.prisma.comment.create({
        data: {
          profileId: account.id,
          activityId: id,
          authorId,
          comment,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async deleteCommentByCommentId(id: string) {
    try {
      return await this.prisma.comment.delete({ where: { id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async updateCommentByCommentId(comment: string, id: string) {
    try {
      return await this.prisma.comment.update({
        where: { id },
        data: { comment },
      });
    } catch (error) {
      prismaErrorHandling(error);
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
      prismaErrorHandling(error);
    }
  }

  async createCommentLikeByCommentId({ commentId, authorId }: CommentLikeDto) {
    try {
      const account = await this.accountService.getAccountByUserId(authorId);
      if (!account?.id) throw new NotFoundException();
      return await this.prisma.commentLike.create({
        data: {
          profileId: account.id,
          authorId,
          commentId,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async deleteCommentLikeByLikeId(id: string) {
    try {
      return await this.prisma.commentLike.delete({ where: { id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getCommentLikesLengthByCommentId(id: string) {
    try {
      return await this.prisma.commentLike.findMany({ where: { commentId: id }, select: { authorId: true, id: true } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
