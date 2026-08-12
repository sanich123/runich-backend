/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ActivityDto } from './activity.dto';
import { prismaErrorHandling } from 'src/common/utils/prisma-errors';
import { AccountService } from 'src/account/account.service';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { chunkArray } from 'src/common/parsers/chunk-array';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
  ) {}

  async createActivity(activityDto: ActivityDto, id: string) {
    try {
      const account = await this.accountService.getAccountByUserId(id);

      if (activityDto?.photoVideoUrls?.length && activityDto?.locations?.length && activityDto?.locations?.length > 1) {
        activityDto.mapPhotoUrl = getMapBoxImage(activityDto?.locations);
      }

      const data = {
        user_id: id,
        profileId: `${account?.id}`,
        ...activityDto,
        photoVideoUrls: activityDto.photoVideoUrls,
        mapPhotoUrlBlurhash: null,
      };
      const serializedData = JSON.stringify(data).replace(/([?&]access_token=)[^&"]+/gi, '$1[скрыт]');
      this.logger.log(`Структура активности перед сохранением: ${serializedData}`);

      return await this.prisma.activity.create({ data });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createActivitiesFromMigrationArchive(
    activities: (ActivityDto & {
      user_id: string;
      profileId: string;
      source: 'strava';
      sourceActivityId: string;
    })[],
  ) {
    try {
      const chunkedActivities = chunkArray(activities, 100);
      await Promise.all(
        chunkedActivities.map(async (activities) => {
          this.logger.debug(`Writing activity batch (${activities.length} records)`);
          return await this.prisma.activity.createMany({ data: activities, skipDuplicates: true });
        }),
      );
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

  async getMediaByUserId(id: string, take = '10') {
    try {
      const photos = await this.prisma.activity.findMany({
        //@ts-ignore
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

  async getActivitiesByTheirIds(ids?: string | string[]) {
    const normalizedIds = (Array.isArray(ids) ? ids : [ids ?? ''])
      .flatMap((activityId) => activityId.split(','))
      .map((activityId) => activityId.trim())
      .filter(Boolean);
    if (!normalizedIds.length) return [];

    const searchByStringOrArray = normalizedIds.length === 1 ? normalizedIds[0] : { in: normalizedIds };
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

  // async getPhotoVideoUrlsWithBlurhash(photoVideoUrls) {
  //   return await Promise.all(
  //     photoVideoUrls.map(async (photoVideoUrl) => {
  //       const blurhash = await blurhashFromURL(photoVideoUrl.thumbnail ? photoVideoUrl.thumbnail : photoVideoUrl.url, {
  //         size: 300,
  //       });
  //       photoVideoUrl.blurhash = blurhash.encoded;
  //       return photoVideoUrl;
  //     }),
  //   );
  // }

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
      return { profile: activity?.profile, email: activity?.users.email, mapPhotoUrl: activity?.mapPhotoUrl };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
