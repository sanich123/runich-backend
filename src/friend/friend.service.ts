import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/prisma-errors';
import { AccountService } from 'src/account/account.service';

@Injectable()
export class FriendService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
  ) {}

  async getUsersYouFollowByUserId(id: string) {
    try {
      return await this.prismaService.friend.findMany({
        where: { user_id: id },
        include: {
          profile: {
            select: {
              surname: true,
              name: true,
              profilePhoto: true,
              profilePhotoBlurhash: true,
            },
          },
        },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteFriendById(id: string, userId?: string) {
    try {
      return await this.prismaService.friend.delete({ where: userId ? { id, user_id: userId } : { id } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getFollowers(id: string) {
    try {
      return await this.prismaService.friend.findMany({
        where: { friendId: id },
        include: {
          users: {
            include: {
              profile: {
                select: {
                  surname: true,
                  name: true,
                  profilePhoto: true,
                  profilePhotoBlurhash: true,
                },
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
      const profile = await this.accountService.getAccountByUserId(id);
      if (!profile) throw new NotFoundException('Профиль пользователя не найден: userId');
      return await this.prismaService.friend.create({
        data: {
          user_id: ownerId,
          friendId: id,
          profileId: profile.id,
        },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }
}
