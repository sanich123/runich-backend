import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { LikeDto } from './like.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';

@Injectable()
export class LikeService {
  constructor(private readonly prismaService: PrismaService) {}

  async sendOrDeleteLike({ authorId, activityId }: LikeDto) {
    try {
      const like = await this.prismaService.like.findUnique({
        where: { authorId, activityId },
      });
      if (like) {
        return await this.prismaService.like.delete({
          where: { authorId, activityId },
        });
      }
      return await this.prismaService.like.create({
        data: {
          authorId,
          activityId,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getLikesByActivityId(id: string) {
    try {
      return await this.prismaService.like.findMany({ where: { activityId: id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
