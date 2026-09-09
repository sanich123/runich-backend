import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { LikeDto } from './like.dto';
import { handleServiceError, isUniqueConstraintError } from 'src/common/utils/database-errors';
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
      if (currentUserId && !(await this.activityService.canAccessActivity(activityId, currentUserId))) {
        throw new NotFoundException('Активность не найдена');
      }
      const account = await this.accountService.getAccountByUserId(currentUserId ?? '');
      if (!account?.id) throw new NotFoundException('Профиль автора не найден: authorId');
      const authorId = currentUserId ?? '';
      const where = { authorId_activityId: { authorId, activityId } };
      try {
        return await this.prismaService.like.upsert({
          where,
          update: {},
          create: { profileId: account.id, authorId, activityId },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        return await this.prismaService.like.findUnique({ where });
      }
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

  async getLikesByActivityId(id: string, currentUserId?: string) {
    try {
      const activity = await this.prismaService.activity.findUnique({
        where: {
          id,
          ...(currentUserId ? { OR: [{ userId: currentUserId }, { isPublic: true }] } : {}),
        },
        select: {
          likes: {
            orderBy: { date: 'desc' },
            select: {
              date: true,
              authorId: true,
              activityId: true,
              profileId: true,
              id: true,
              profile: {
                select: {
                  name: true,
                  surname: true,
                  profilePhoto: true,
                  profilePhotoBlurhash: true,
                  city: true,
                  userId: true,
                },
              },
            },
          },
        },
      });
      if (!activity) {
        if (currentUserId) throw new NotFoundException('Активность не найдена');
        return [];
      }
      return activity.likes;
    } catch (error) {
      handleServiceError(error);
    }
  }
}
