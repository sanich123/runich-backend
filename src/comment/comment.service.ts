import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { CommentDTO } from './comment.dto';

@Injectable()
export class CommentService {
  constructor(private readonly prisma: PrismaService) {}

  async getCommentsbyActivityId(id: string) {
    try {
      return await this.prisma.comment.findMany({
        where: { activityId: id },
        orderBy: {
          date: 'desc',
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
}
