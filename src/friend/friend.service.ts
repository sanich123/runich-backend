import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { FriendDto } from './friend.dto';
import { UserService } from 'src/user/user.service';
import { throwNotFoundException } from 'src/utils/utils';

@Injectable()
export class FriendService {
  constructor(private readonly prismaService: PrismaService, private readonly userService: UserService) {}

  async addFriend({ userId, friendId }: FriendDto) {
    try {
      const friend = await this.userService.findOne(friendId);
      if (!friend) throw new throwNotFoundException('Could not be able to find that user');
      const {
        profile: { profilePhoto },
      } = friend;
      await this.prismaService.friend.create({
        data: { friendPhoto: profilePhoto, userId, friendId },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getFriendsById(id: string) {
    try {
      return await this.prismaService.friend.findMany({ where: { userId: id } });
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
}
