import { ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError, isUniqueConstraintError } from 'src/common/utils/database-errors';
import { AccountService } from 'src/account/account.service';
import { FRIEND_PROFILE_SELECT } from './const';
import { ModerationAccessService } from 'src/moderation/moderation-access.service';

@Injectable()
export class FriendService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
    @Optional() @Inject(ModerationAccessService) moderationAccess?: ModerationAccessService,
  ) {
    this.moderationAccess = moderationAccess ?? new ModerationAccessService(this.prismaService);
  }

  private readonly moderationAccess: ModerationAccessService;

  private async assertFollowListsVisible(id: string, currentUserId?: string) {
    if (!currentUserId || currentUserId === id) return;

    if (await this.moderationAccess.areBlocked(id, currentUserId)) {
      throw new ForbiddenException('Профиль недоступен');
    }
    const profile = await this.prismaService.profile.findUnique({
      where: { userId: id },
      select: { hideFollowingList: true },
    });
    if (profile?.hideFollowingList) {
      throw new ForbiddenException('Владелец профиля скрыл списки подписок и подписчиков');
    }
  }

  async getUsersYouFollowByUserId(id: string, currentUserId?: string) {
    try {
      await this.assertFollowListsVisible(id, currentUserId);
      const blockedUserIds = currentUserId ? await this.moderationAccess.blockedUserIds(currentUserId) : [];
      return await this.prismaService.friend.findMany({
        where: { userId: id, ...(blockedUserIds.length ? { friendId: { notIn: blockedUserIds } } : {}) },
        select: {
          createdAt: true,
          updatedAt: true,
          userId: true,
          friendId: true,
          profileId: true,
          id: true,
          profile: {
            select: FRIEND_PROFILE_SELECT,
          },
        },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteFriendById(id: string, userId?: string) {
    try {
      return await this.prismaService.friend.delete({ where: userId ? { id, userId } : { id } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getFollowers(id: string, currentUserId?: string) {
    try {
      await this.assertFollowListsVisible(id, currentUserId);
      const blockedUserIds = currentUserId ? await this.moderationAccess.blockedUserIds(currentUserId) : [];
      return await this.prismaService.friend.findMany({
        where: { friendId: id, ...(blockedUserIds.length ? { userId: { notIn: blockedUserIds } } : {}) },
        select: {
          createdAt: true,
          updatedAt: true,
          userId: true,
          friendId: true,
          profileId: true,
          id: true,
          user: {
            select: {
              profile: {
                select: FRIEND_PROFILE_SELECT,
              },
            },
          },
        },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async addFriendByFriendId(id: string, currentUserId: string | { userId: string }) {
    try {
      const ownerId = typeof currentUserId === 'string' ? currentUserId : currentUserId.userId;
      if (await this.moderationAccess.areBlocked(ownerId, id)) {
        throw new ForbiddenException('Нельзя подписаться на заблокированного пользователя');
      }
      const profile = await this.accountService.getAccountByUserId(id);
      if (!profile) throw new NotFoundException('Профиль пользователя не найден: userId');
      if (profile.allowNewFollowers === false) {
        throw new ForbiddenException('Владелец профиля запретил новые подписки');
      }
      const where = { userId_friendId: { userId: ownerId, friendId: id } };
      try {
        return await this.prismaService.friend.upsert({
          where,
          update: {},
          create: { userId: ownerId, friendId: id, profileId: profile.id },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        return await this.prismaService.friend.findUnique({ where });
      }
    } catch (error) {
      handleServiceError(error);
    }
  }
}
