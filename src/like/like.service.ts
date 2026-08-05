import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { LikeDto } from './like.dto';
import { prismaErrorHandling } from 'src/common/utils/prisma-errors';
import { AccountService } from 'src/account/account.service';
import { ActivityService } from 'src/activity/activity.service';

@Injectable()
export class LikeService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
  ) {}

  async addLike({ authorId, activityId }: LikeDto) {
    try {
      const account = await this.accountService.getAccountByUserId(authorId);
      if (!account?.id) throw new NotFoundException();
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

  async deleteLikeById(id: string) {
    return await this.prismaService.like.delete({ where: { id } });
  }

  async getLikesByActivityId(id: string) {
    try {
      return await this.prismaService.like.findMany({
        where: { activityId: id },
        orderBy: { date: 'desc' },
        include: { profile: true },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
