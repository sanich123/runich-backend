import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ActivityDto } from './activity.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { FriendService } from 'src/friend/friend.service';
import { AccountService } from 'src/account/account.service';

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendService,
    private readonly accountService: AccountService,
  ) {}

  async createActivity(activityDto: ActivityDto, id: string) {
    try {
      const account = await this.accountService.getAccountByUserId(id);
      return await this.prisma.activity.create({
        data: {
          user_id: id,
          profileId: account.id,
          ...activityDto,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getActivityByActivityId(id: string) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id },
        select: {
          description: true,
          title: true,
          date: true,
          sport: true,
          id: true,
          user_id: true,
          photoVideoUrls: true,
          mapPhotoUrl: true,
          duration: true,
          distance: true,
          likes: true,
          comments: true,
          profile: true,
        },
      });
      return activity;
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getMedia(id: string) {
    try {
      return await this.prisma.activity.findMany({
        where: { user_id: id },
        select: { photoVideoUrls: true },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getActivitesByUserId(id: string) {
    try {
      return await this.prisma.activity.findMany({
        where: { user_id: id },
        orderBy: { date: 'desc' },
        include: {
          comments: true,
          profile: true,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getAllActivitiesWithFriends(id: string) {
    try {
      const friends = await this.friendsService.getFriendsById(id);
      const ids = friends.map(({ friendId }) => friendId);
      return await this.prisma.activity.findMany({
        where: { user_id: { in: [...ids, id] }, isPublic: true },
        orderBy: { date: 'desc' },
        select: {
          description: true,
          title: true,
          date: true,
          sport: true,
          id: true,
          user_id: true,
          photoVideoUrls: true,
          mapPhotoUrl: true,
          duration: true,
          distance: true,
          likes: true,
          comments: true,
          users: true,
          profile: true,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async deleteActivityById(id: string) {
    try {
      return await this.prisma.activity.delete({ where: { id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
