import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError, isUniqueConstraintError } from 'src/common/utils/database-errors';
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
        where: { userId: id },
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
      return await this.prismaService.friend.delete({ where: userId ? { id, userId } : { id } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getFollowers(id: string) {
    try {
      return await this.prismaService.friend.findMany({
        where: { friendId: id },
        include: {
          user: {
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
      const where = { userId_friendId: { userId: ownerId, friendId: id } };
      try {
        await this.prismaService.friend.upsert({
          where,
          update: {},
          create: { userId: ownerId, friendId: id, profileId: profile.id },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
      return await this.prismaService.friend.findUnique({ where });
    } catch (error) {
      handleServiceError(error);
    }
  }
}
