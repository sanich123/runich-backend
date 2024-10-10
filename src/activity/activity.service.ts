import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { ActivityDto } from './activity.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { AccountService } from 'src/account/account.service';
import { blurhashFromURL } from 'blurhash-from-url';
import { getMapBoxImage } from 'src/utils/parsers/get-mapbox-image';
import { chunkArray } from 'src/utils/parsers/chunk-array';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService, private readonly accountService: AccountService) {}

  async createActivity(activityDto: ActivityDto, id: string) {
    try {
      const account = await this.accountService.getAccountByUserId(id);
      let mapPhotoUrlBlurhash;
      let photoVideoUrlsWithBlurhash;
      if (activityDto?.photoVideoUrls.length) {
        photoVideoUrlsWithBlurhash = await this.getPhotoVideoUrlsWithBlurhash(activityDto.photoVideoUrls);
      }
      if (activityDto?.locations.length > 1) {
        activityDto.mapPhotoUrl = getMapBoxImage(activityDto?.locations);
      }
      if (activityDto?.mapPhotoUrl) {
        const blurhash = await blurhashFromURL(activityDto.mapPhotoUrl, { size: 300 });
        mapPhotoUrlBlurhash = blurhash.encoded;
      }
      return await this.prisma.activity.create({
        data: {
          user_id: id,
          profileId: account.id,
          ...activityDto,
          photoVideoUrls: photoVideoUrlsWithBlurhash || null,
          mapPhotoUrlBlurhash,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createActivitiesFromMigrationArchive(activities: (ActivityDto & { user_id: string; profileId: string })[]) {
    try {
      const chunkedActivities = chunkArray(activities, 100);
      await Promise.allSettled(
        chunkedActivities.map(async (activities) => {
          console.log('Записываем 100 активностей');
          return await this.prisma.activity.createMany({ data: activities });
        }),
      );
      if (existsSync('dist/migration')) {
        await rm('dist/migration', { recursive: true });
      }
      if (existsSync('dist/receivedArchive')) {
        await rm('dist/receivedArchive');
      }
      return { success: true };
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

  async getLocationsByActivityId(id: string) {
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
          isPublic: true,
          emotion: true,
          kilometresSplit: true,
          profile: {
            select: {
              surname: true,
              name: true,
              profilePhoto: true,
              profilePhotoBlurhash: true,
              emailNotifications: true,
              users: { select: { email: true } },
            },
          },
          _count: {
            select: {
              comments: true,
            },
          },
        },
      });
      return activity;
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getMediaByUserId(id: string, take) {
    try {
      const photos = await this.prisma.activity.findMany({
        where: { user_id: id, photoVideoUrls: { not: null } },
        orderBy: { date: 'desc' },
        select: { photoVideoUrls: true },
      });
      const flattedPhotos = photos?.map(({ photoVideoUrls }) => photoVideoUrls).flat();
      const slicedPhotos = flattedPhotos?.slice(0, Number(take));
      return { photos: slicedPhotos, isLastPage: flattedPhotos?.length <= slicedPhotos?.length };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getActivitesByUserId(id: string, page = '0', take = '10') {
    try {
      const activities = await this.prisma.activity.findMany({
        where: { user_id: id },
        orderBy: { date: 'desc' },
        skip: Number(page) * Number(take),
        take: Number(take),
        include: {
          profile: {
            select: {
              surname: true,
              name: true,
              profilePhoto: true,
              profilePhotoBlurhash: true,
              emailNotifications: true,
            },
          },
          _count: {
            select: {
              comments: true,
            },
          },
        },
      });
      return { activities, isLastPage: !activities.length };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getActivitiesByTheirIds(ids: string | string[]) {
    const searchByStringOrArray = typeof ids === 'string' ? ids : { in: ids };
    try {
      return await this.prisma.activity.findMany({
        where: { id: searchByStringOrArray, isPublic: true },
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
          profile: {
            select: {
              surname: true,
              name: true,
              profilePhoto: true,
              profilePhotoBlurhash: true,
              emailNotifications: true,
            },
          },
          _count: {
            select: {
              comments: true,
            },
          },
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getAllActivitiesWithFriends(id: string, page = '0', take = '10') {
    try {
      const friends = await this.prisma.friend.findMany({
        where: { user_id: id },
        select: { friendId: true },
      });
      const ids = friends.map(({ friendId }) => friendId);
      const activities = await this.prisma.activity.findMany({
        where: { user_id: { in: [...ids, id] }, isPublic: true },
        orderBy: { date: 'desc' },
        skip: Number(page) * Number(take),
        take: Number(take),
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
          profile: {
            select: {
              surname: true,
              name: true,
              profilePhoto: true,
              profilePhotoBlurhash: true,
              emailNotifications: true,
              users: { select: { email: true } },
            },
          },
          _count: {
            select: {
              comments: true,
            },
          },
        },
      });
      return { activities, isLastPage: !activities.length };
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

  async getPhotoVideoUrlsWithBlurhash(photoVideoUrls) {
    return await Promise.all(
      photoVideoUrls.map(async (photoVideoUrl) => {
        const blurhash = await blurhashFromURL(photoVideoUrl.thumbnail ? photoVideoUrl.thumbnail : photoVideoUrl.url, {
          size: 300,
        });
        photoVideoUrl.blurhash = blurhash.encoded;
        return photoVideoUrl;
      }),
    );
  }

  async getActivityWithEmailData(activityId: string) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        select: {
          users: {
            select: {
              email: true,
            },
          },
          profile: {
            select: {
              id: true,
              profilePhoto: true,
              name: true,
              surname: true,
              emailNotifications: true,
            },
          },
          mapPhotoUrl: true,
        },
      });
      return { profile: activity.profile, email: activity.users.email, mapPhotoUrl: activity.mapPhotoUrl };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
