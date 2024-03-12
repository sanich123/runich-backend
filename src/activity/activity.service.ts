import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ActivityDto } from './activity.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { FriendService } from 'src/friend/friend.service';
import { AccountService } from 'src/account/account.service';
import { blurhashFromURL } from 'blurhash-from-url';

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
      let mapPhotoUrlBlurhash;
      let photoVideoUrlsWithBlurhash;
      if (activityDto.photoVideoUrls.length) {
        photoVideoUrlsWithBlurhash = await await Promise.all(
          activityDto.photoVideoUrls.map(async (photoVideoUrl) => {
            const blurhash = await blurhashFromURL(
              photoVideoUrl.thumbnail ? photoVideoUrl.thumbnail : photoVideoUrl.url,
              { size: 300 },
            );
            photoVideoUrl.blurhash = blurhash.encoded;
            return photoVideoUrl;
          }),
        );
      }
      if (activityDto.mapPhotoUrl) {
        const blurhash = await blurhashFromURL(activityDto.mapPhotoUrl, { size: 300 });
        mapPhotoUrlBlurhash = blurhash.encoded;
      }
      return await this.prisma.activity.create({
        data: {
          user_id: id,
          profileId: account.id,
          ...activityDto,
          photoVideoUrls: photoVideoUrlsWithBlurhash || [],
          mapPhotoUrlBlurhash,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async updateActivity(activityDto: ActivityDto, id: string) {
    try {
      const { date, description, emotion, isPublic, photoVideoUrls, sport, title, distance, duration, speed } =
        activityDto;
      return await this.prisma.activity.update({
        where: { id },
        data: {
          title,
          sport,
          photoVideoUrls,
          isPublic,
          emotion,
          date,
          description,
          distance,
          duration,
          speed,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
  async getLocations(id: string) {
    return await this.prisma.activity.findUnique({
      where: { id },
      select: {
        locations: true,
        kilometresSplit: true,
      },
    });
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
          mapPhotoUrlBlurhash: true,
          duration: true,
          distance: true,
          likes: true,
          comments: true,
          profile: true,
          isPublic: true,
          emotion: true,
          kilometresSplit: true,
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
          mapPhotoUrlBlurhash: true,
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
