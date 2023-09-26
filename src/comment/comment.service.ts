import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { CommentDTO, CommentLikeDto } from './comment.dto';

@Injectable()
export class CommentService {
  constructor(private readonly prisma: PrismaService) {}

  async getCommentsbyActivityId(id: string) {
    try {
      return await this.prisma.comment.findMany({
        where: { activityId: id },
        orderBy: {
          date: 'asc',
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createCommentByActivityId(commentDto: CommentDTO, id: string) {
    try {
      return await this.prisma.comment.create({
        data: {
          activityId: id,
          ...commentDto,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createCommentLikeByCommentId({ commentId, authorId }: CommentLikeDto) {
    try {
      const like = await this.prisma.commentLike.findFirst({
        where: { commentId, authorId },
      });
      if (like) {
        return await this.prisma.commentLike.delete({
          where: { id: like.id },
        });
      }
      return await this.prisma.commentLike.create({
        data: {
          authorId,
          commentId,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getCommentLikesLengthByCommentId(id: string) {
    try {
      return this.prisma.commentLike.findMany({
        where: {
          commentId: id,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
