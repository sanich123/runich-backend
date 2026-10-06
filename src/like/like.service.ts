import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { LikeDto } from './like.dto';
import { handleServiceError, isUniqueConstraintError } from 'src/common/utils/database-errors';
import { AccountService } from 'src/account/account.service';
import { ActivityService } from 'src/activity/activity.service';
import { encodeLikeCursor } from './like.pagination';
import type { LikeCursor } from './like.pagination';

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
      if (currentUserId && !(await this.activityService.canInteractWithActivity(activityId, currentUserId))) {
        throw new ForbiddenException('Владелец активности запретил лайки и комментарии');
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

  async getLikesByActivityId(id: string, currentUserId?: string, limit = '30', cursor?: LikeCursor) {
    try {
      const pageSize = Number(limit);
      const activity = await this.prismaService.activity.findUnique({
        where: { id },
        select: {
          userId: true,
          visibility: true,
          profile: { select: { allowLikesListViewing: true } },
          likes: {
            ...(cursor
              ? {
                  where: {
                    OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
                  },
                }
              : {}),
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
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
            take: pageSize + 1,
          },
        },
      });
      if (!activity) {
        if (currentUserId) throw new NotFoundException('Активность не найдена');
        return { likes: [], hasMore: false, nextCursor: null, currentUserLike: null };
      }
      if (currentUserId && !(await this.activityService.canAccessActivityData(activity, currentUserId))) {
        throw new NotFoundException('Активность не найдена');
      }
      if (activity.userId !== currentUserId && activity.profile?.allowLikesListViewing === false) {
        throw new NotFoundException('Список лайков недоступен');
      }
      const likesWithExtraItem = activity.likes;
      const hasMore = likesWithExtraItem.length > pageSize;
      const likes = likesWithExtraItem.slice(0, pageSize);
      const currentUserLike =
        currentUserId && !cursor
          ? await this.prismaService.like.findUnique({
              where: { authorId_activityId: { authorId: currentUserId, activityId: id } },
              select: { id: true, authorId: true },
            })
          : null;
      return {
        likes,
        hasMore,
        nextCursor: hasMore && likes.length ? encodeLikeCursor(likes.at(-1)!) : null,
        currentUserLike,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getLikesLengthByActivityId(id: string, currentUserId?: string) {
    try {
      const activity = await this.prismaService.activity.findUnique({
        where: { id },
        select: { userId: true, visibility: true, _count: { select: { likes: true } } },
      });
      if (!activity) {
        if (currentUserId) throw new NotFoundException('Активность не найдена');
        return 0;
      }
      if (currentUserId && !(await this.activityService.canAccessActivityData(activity, currentUserId))) {
        throw new NotFoundException('Активность не найдена');
      }
      return activity._count.likes;
    } catch (error) {
      handleServiceError(error);
    }
  }
}
