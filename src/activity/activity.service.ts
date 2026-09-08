/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ActivityDto } from './activity.dto';
import { handleServiceError } from 'src/common/utils/database-errors';
import { AccountService } from 'src/account/account.service';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { chunkArray } from 'src/common/parsers/chunk-array';
import { generateActivityTitle } from './activity-title';
import { blurhashFromUrl } from 'src/common/images/blurhash';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ACTIVITY_CARD_SELECT, ACTIVITY_FEED_SELECT, DEFAULT_ACTIVITY_PAGE_SIZE } from './const';

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

  async canAccessActivity(id: string, currentUserId?: string) {
    if (!currentUserId) return true;

    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: { userId: true, isPublic: true },
    });

    return Boolean(activity && (activity.userId === currentUserId || activity.isPublic === true));
  }

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
        userId: id,
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
      userId: string;
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

  async updateActivity(activityDto: ActivityDto, id: string, userId = id) {
    try {
      const { date, description, emotion, isPublic, photoVideoUrls, sport, title, distance, duration, speed, steps } =
        activityDto;
      const data = {
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
        ...(steps === undefined ? {} : { steps }),
      };
      return await this.persistenceService.update(id, userId, data);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getLocationsByActivityId(id: string, currentUserId?: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: {
        locations: true,
        kilometresSplit: true,
        userId: true,
        isPublic: true,
      },
    });
    if (!activity || !currentUserId) return activity;
    if (activity.userId !== currentUserId && activity.isPublic !== true) return null;
    return { locations: activity.locations, kilometresSplit: activity.kilometresSplit };
  }

  async getActivityByActivityId(id: string, currentUserId?: string) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id },
        select: {
          ...ACTIVITY_FEED_SELECT,
          isPublic: true,
          emotion: true,
          kilometresSplit: true,
        },
      });
      if (activity && currentUserId && activity.userId !== currentUserId && activity.isPublic !== true) {
        return null;
      }
      return activity;
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getMediaByUserId(id: string, take = '10', currentUserId?: string) {
    try {
      const photos = await this.prisma.activity.findMany({
        //@ts-ignore
        where: {
          userId: id,
          // @ts-ignore Prisma's generated JSON filter type does not accept SQL NULL here.
          photoVideoUrls: { not: null },
          ...(currentUserId && currentUserId !== id ? { isPublic: true } : {}),
        },
        orderBy: { date: 'desc' },
        select: { photoVideoUrls: true },
      });
      const flattedPhotos = photos?.map(({ photoVideoUrls }: { photoVideoUrls?: unknown }) => photoVideoUrls).flat();
      const slicedPhotos = flattedPhotos?.slice(0, Number(take));
      return { photos: slicedPhotos, isLastPage: flattedPhotos?.length <= slicedPhotos?.length };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getActivitesByUserId(
    id: string,
    page = '0',
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    currentUserId?: string,
  ) {
    try {
      const activities = await this.prisma.activity.findMany({
        where: {
          userId: id,
          ...(currentUserId && currentUserId !== id ? { isPublic: true } : {}),
        },
        orderBy: { date: 'desc' },
        skip: Number(page) * Number(take),
        take: Number(take),
        select: ACTIVITY_CARD_SELECT,
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
        select: ACTIVITY_CARD_SELECT,
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getAllActivitiesWithFriends(id: string, page = '0', take = String(DEFAULT_ACTIVITY_PAGE_SIZE)) {
    try {
      const friends = await this.prisma.friend.findMany({
        where: { userId: id },
        select: { friendId: true },
      });
      const ids = friends.map(({ friendId }: { friendId: string }) => friendId);
      const activities = await this.prisma.activity.findMany({
        where: { userId: { in: [...ids, id] }, isPublic: true },
        orderBy: { date: 'desc' },
        skip: Number(page) * Number(take),
        take: Number(take),
        select: ACTIVITY_FEED_SELECT,
      });
      return { activities, isLastPage: !activities.length };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteActivityById(id: string, userId = id) {
    try {
      return await this.persistenceService.delete(id, userId);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getActivityWithEmailData(activityId: string) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        select: {
          user: {
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
      return { profile: activity?.profile, email: activity?.user.email, mapPhotoUrl: activity?.mapPhotoUrl };
    } catch (error) {
      handleServiceError(error);
    }
  }
}
