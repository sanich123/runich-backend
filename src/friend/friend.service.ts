import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { FriendDto } from './friend.dto';
import { AccountService } from 'src/account/account.service';

@Injectable()
export class FriendService {
  constructor(
    private readonly prismaService: PrismaService,
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
      prismaErrorHandling(error);
    }
  }

  async deleteFriendById(id: string) {
    try {
      return await this.prismaService.friend.delete({ where: { id } });
    } catch (error) {
      prismaErrorHandling(error);
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
      prismaErrorHandling(error);
    }
  }

  async addFriendByFriendId(id: string, { userId }: FriendDto) {
    try {
      const profile = await this.accountService.getAccountByUserId(id);
      if (!profile) throw new NotFoundException('Could not be able to find profile of that user');
      return await this.prismaService.friend.create({
        data: {
          user_id: userId,
          friendId: id,
          profileId: profile.id,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
