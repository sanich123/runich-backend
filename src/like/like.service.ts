import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { LikeDto } from './like.dto';
import { handleServiceError } from 'src/common/utils/prisma-errors';
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

  async addLike({ activityId }: LikeDto, currentUserId?: string) {
    try {
      const account = await this.accountService.getAccountByUserId(currentUserId ?? '');
      if (!account?.id) throw new NotFoundException('Профиль автора не найден: authorId');
      return await this.prismaService.like.create({
        data: currentUserId
          ? { profileId: account.id, authorId: currentUserId, activityId }
          : ({ profileId: account.id, activityId } as never),
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteLikeById(id: string, authorId?: string) {
    try {
      return await this.prismaService.like.delete({ where: authorId ? { id, authorId } : { id } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getLikesByActivityId(id: string) {
    try {
      return await this.prismaService.like.findMany({
        where: { activityId: id },
        orderBy: { date: 'desc' },
        include: { profile: true },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }
}
