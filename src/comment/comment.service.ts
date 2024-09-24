import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { CommentDTO, CommentLikeDto } from './comment.dto';
import { AccountService } from 'src/account/account.service';

@Injectable()
export class CommentService {
  constructor(private readonly prisma: PrismaService, private readonly accountService: AccountService) {}

  async getCommentsbyActivityId(id: string, take: string) {
    try {
      const allCommentsLength = await this.prisma.comment.count({
        where: {
          activityId: id,
        },
      });
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
    const account = await this.accountService.getAccountByUserId(authorId);
    try {
      return await this.prisma.comment.create({
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

  async createCommentLikeByCommentId({ commentId, authorId }: CommentLikeDto) {
    try {
      const account = await this.accountService.getAccountByUserId(authorId);
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
