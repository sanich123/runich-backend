/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ActivityDto } from './activity.dto';
import { handleServiceError } from 'src/common/utils/prisma-errors';
import { AccountService } from 'src/account/account.service';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { chunkArray } from 'src/common/parsers/chunk-array';
import { generateActivityTitle } from './activity-title';
import { blurhashFromUrl } from 'src/common/images/blurhash';
import { ActivityPersistenceService } from './activity-persistence.service';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AccountService)
    private readonly accountService: AccountService,
    @Inject(ActivityPersistenceService)
    persistenceService?: ActivityPersistenceService,
  ) {
    this.persistenceService = persistenceService ?? new ActivityPersistenceService(this.prisma);
  }

  private readonly persistenceService: ActivityPersistenceService;

  async createActivity(activityDto: ActivityDto, id: string) {
    try {
      const account = await this.accountService.getAccountByUserId(id);

      if (activityDto?.photoVideoUrls?.length && activityDto?.locations?.length && activityDto?.locations?.length > 1) {
        activityDto.mapPhotoUrl = getMapBoxImage(activityDto?.locations);
      }

      const photoVideoUrls = activityDto.photoVideoUrls
        ? await Promise.all(
            activityDto.photoVideoUrls.map(async (photo) => ({
              ...photo,
              blurhash: photo.blurhash ?? (await blurhashFromUrl(photo.thumbnail || photo.url)),
            })),
          )
        : activityDto.photoVideoUrls;
      const mapPhotoUrlBlurhash = activityDto.mapPhotoUrl ? await blurhashFromUrl(activityDto.mapPhotoUrl) : null;

      const data = {
        user_id: id,
        profileId: `${account?.id}`,
        ...activityDto,
        title: activityDto.title?.trim()
          ? activityDto.title
          : generateActivityTitle(activityDto.sport, activityDto.date),
        photoVideoUrls,
        mapPhotoUrlBlurhash,
      };
      const serializedData = JSON.stringify(data).replace(/([?&]access_token=)[^&"]+/gi, '$1[скрыт]');
      this.logger.log(`Структура активности перед сохранением: ${serializedData}`);

      return await this.persistenceService.create(data);
    } catch (error) {
      handleServiceError(error);
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
      const activitiesWithTitles = activities.map((activity) => ({
        ...activity,
        title: activity.title?.trim() ? activity.title : generateActivityTitle(activity.sport, activity.date),
      }));
      const chunkedActivities = chunkArray(activitiesWithTitles, 100);
      await Promise.all(
        chunkedActivities.map(async (activities) => {
          this.logger.debug(`Writing activity batch (${activities.length} records)`);
          return await this.persistenceService.createMany(activities);
        }),
      );
      return { success: true };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async updateActivity(activityDto: ActivityDto, id: string) {
    try {
      const { date, description, emotion, isPublic, photoVideoUrls, sport, title, distance, duration, speed } =
        activityDto;
      return await this.persistenceService.update(id, {
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
      });
    } catch (error) {
      handleServiceError(error);
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
      handleServiceError(error);
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
      handleServiceError(error);
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
      handleServiceError(error);
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
      handleServiceError(error);
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
      handleServiceError(error);
    }
  }

  async deleteActivityById(id: string) {
    try {
      return await this.persistenceService.delete(id);
    } catch (error) {
      handleServiceError(error);
    }
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
      return { profile: activity?.profile, email: activity?.users.email, mapPhotoUrl: activity?.mapPhotoUrl };
    } catch (error) {
      handleServiceError(error);
    }
  }
}
