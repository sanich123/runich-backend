import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { CommentDTO, CommentLikeDto } from './comment.dto';
import { AccountService } from 'src/account/account.service';

@Injectable()
export class CommentService {
  constructor(private readonly prisma: PrismaService, private readonly accountService: AccountService) {}

  async getCommentsbyActivityId(id: string) {
    try {
      return await this.prisma.comment.findMany({
        where: { activityId: id },
        orderBy: {
          date: 'asc',
        },
        include: {
          profile: true,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createCommentByActivityId(commentDto: CommentDTO, id: string) {
    const { authorId } = commentDto;
    const account = await this.accountService.getAccountByUserId(authorId);
    try {
      return await this.prisma.comment.create({
        data: {
          profileId: account.id,
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
      // const like = await this.prisma.commentLike.findFirst({
      //   where: { commentId, authorId },
      // });
      // if (like) {
      //   return await this.prisma.commentLike.delete({
      //     where: { id: like.id },
      //   });
      // }
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
    return await this.prisma.commentLike.delete({
      where: { id },
    });
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
