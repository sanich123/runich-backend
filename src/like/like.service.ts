import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { LikeDto } from './like.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { AccountService } from 'src/account/account.service';

@Injectable()
export class LikeService {
  constructor(private readonly prismaService: PrismaService, private readonly accountService: AccountService) {}

  async sendOrDeleteLike({ authorId, activityId }: LikeDto) {
    try {
      const like = await this.prismaService.like.findFirst({
        where: { authorId, activityId },
      });
      if (like) {
        return await this.prismaService.like.delete({
          where: { id: like.id },
        });
      }
      const account = await this.accountService.getAccountByUserId(authorId);
      return await this.prismaService.like.create({
        data: {
          profileId: account.id,
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
      return await this.prismaService.like.findMany({
        where: { activityId: id },
        orderBy: {
          date: 'desc',
        },
        include: {
          profile: true,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
