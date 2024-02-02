import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ActivityDto } from './activity.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { FriendService } from 'src/friend/friend.service';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService, private readonly friendsService: FriendService) {}

  async createActivity(activityDto: ActivityDto, id: string) {
    try {
      return await this.prisma.activity.create({
        data: {
          user_id: id,
          ...activityDto,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getActivityByActivityId(id: string) {
    try {
      return await this.prisma.activity.findUnique({
        where: { id },
        include: {
          comments: true,
          likes: true,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getMedia(id: string) {
    try {
      return await this.prisma.activity.findMany({
        where: { user_id: id },
        select: { photoUrls: true },
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
          likes: true,
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
        where: { user_id: { in: [...ids, id] } },
        orderBy: { date: 'desc' },
        select: {
          description: true,
          title: true,
          date: true,
          sport: true,
          id: true,
          user_id: true,
          photoUrls: true,
          duration: true,
          distance: true,
          likes: true,
          comments: true,
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
