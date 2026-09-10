/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ActivityDto } from './activity.dto';
import { handleServiceError } from 'src/common/utils/database-errors';
import { AccountService } from 'src/account/account.service';
import { getMapBoxImage } from 'src/common/parsers/get-mapbox-image';
import { chunkArray } from 'src/common/parsers/chunk-array';
import { generateActivityTitle } from './activity-title';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ACTIVITY_MEDIA_PROCESSING_STATUS } from './activity-media-processing.constants';
import {
  ACTIVITY_CARD_SELECT,
  ACTIVITY_FEED_SELECT,
  DEFAULT_ACTIVITY_PAGE_SIZE,
  MEDIA_ACTIVITY_BATCH_SIZE,
} from './const';
import {
  encodeActivityCursor,
  encodeActivityMediaCursor,
  type ActivityCursor,
  type ActivityMediaCursor,
} from './activity.pagination';
import { omitMediaProcessingStatus } from './utils';
import type { ActivityFeedSqlRow } from './type';

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

      const photoVideoUrls = activityDto.photoVideoUrls;
      const mapPhotoUrlBlurhash = null;

      const data = {
        userId: id,
        profileId: `${account?.id}`,
        ...activityDto,
        title: activityDto.title?.trim()
          ? activityDto.title
          : generateActivityTitle(activityDto.sport, activityDto.date),
        photoVideoUrls,
        mapPhotoUrlBlurhash,
        mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued,
      };
      const photoCount = Array.isArray(photoVideoUrls) ? photoVideoUrls.length : 0;
      const locationCount = Array.isArray(activityDto.locations) ? activityDto.locations.length : 0;
      this.logger.log(
        `Сохранение активности: userId=${id}, sport=${activityDto.sport}, date=${activityDto.date}, photos=${photoCount}, locations=${locationCount}`,
      );

      return omitMediaProcessingStatus(await this.persistenceService.create(data));
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
      const { date, description, emotion, isPublic, sport, title, distance, duration, speed } = activityDto;
      const data = {
        title,
        sport,
        isPublic,
        emotion,
        date,
        description: description?.trim() || null,
        distance,
        duration,
        speed,
      };
      return omitMediaProcessingStatus(await this.persistenceService.update(id, userId, data));
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

  async getMediaByUserId(id: string, take = '10', cursor?: ActivityMediaCursor, currentUserId?: string) {
    try {
      const pageSize = Number(take);
      const photos: unknown[] = [];
      const photoCursors: ActivityMediaCursor[] = [];
      let activityCursor: ActivityCursor | undefined = cursor;
      let includeCursorActivity = Boolean(cursor);
      let skipPhotoIndex = cursor?.photoIndex ?? -1;

      while (photos.length <= pageSize) {
        const activities = await this.prisma.activity.findMany({
          // @ts-ignore Prisma's generated JSON filter type does not accept SQL NULL here.
          where: {
            userId: id,
            photoVideoUrls: { not: null },
            ...(currentUserId && currentUserId !== id ? { isPublic: true } : {}),
            ...(activityCursor
              ? {
                  OR: [
                    { date: { lt: activityCursor.date } },
                    { date: activityCursor.date, id: { lt: activityCursor.id } },
                    ...(includeCursorActivity ? [{ date: activityCursor.date, id: activityCursor.id }] : []),
                  ],
                }
              : {}),
          },
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          take: MEDIA_ACTIVITY_BATCH_SIZE,
          select: { id: true, date: true, photoVideoUrls: true },
        });

        if (!activities.length) break;

        for (const activity of activities) {
          const activityPhotos = Array.isArray(activity.photoVideoUrls) ? activity.photoVideoUrls : [];
          const firstPhotoIndex =
            includeCursorActivity && activity.id === cursor?.id && activity.date.getTime() === cursor?.date.getTime()
              ? skipPhotoIndex + 1
              : 0;

          for (let photoIndex = firstPhotoIndex; photoIndex < activityPhotos.length; photoIndex += 1) {
            photos.push(activityPhotos[photoIndex]);
            photoCursors.push({ date: activity.date, id: activity.id, photoIndex });
            if (photos.length > pageSize) break;
          }
          if (photos.length > pageSize) break;
        }

        const lastActivity = activities.at(-1)!;
        activityCursor = { date: lastActivity.date, id: lastActivity.id };
        includeCursorActivity = false;
        skipPhotoIndex = -1;
        if (activities.length < MEDIA_ACTIVITY_BATCH_SIZE) break;
      }

      const hasMore = photos.length > pageSize;
      const slicedPhotos = photos.slice(0, pageSize);
      const slicedCursors = photoCursors.slice(0, pageSize);
      return {
        photos: slicedPhotos,
        hasMore,
        nextCursor: hasMore && slicedCursors.length ? encodeActivityMediaCursor(slicedCursors.at(-1)!) : null,
        isLastPage: !hasMore,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getActivitesByUserId(
    id: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
    currentUserId?: string,
  ) {
    try {
      const activitiesWithExtraItem = await this.prisma.activity.findMany({
        where: {
          userId: id,
          ...(currentUserId && currentUserId !== id ? { isPublic: true } : {}),
          ...(cursor
            ? {
                OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
              }
            : {}),
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: Number(take) + 1,
        select: ACTIVITY_CARD_SELECT,
      });
      const hasMore = activitiesWithExtraItem.length > Number(take);
      const activities = activitiesWithExtraItem.slice(0, Number(take));
      return {
        activities,
        hasMore,
        nextCursor: hasMore && activities.length ? encodeActivityCursor(activities.at(-1)!) : null,
        isLastPage: !hasMore,
      };
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

  async getAllActivitiesWithFriends(id: string, take = String(DEFAULT_ACTIVITY_PAGE_SIZE), cursor?: ActivityCursor) {
    try {
      const activitiesWithExtraItem = await this.prisma.$queryRaw<ActivityFeedSqlRow[]>`
        SELECT
          a."title",
          a."date",
          a."sport",
          a."id",
          a."user_id" AS "userId",
          a."photoVideoUrls",
          a."mapPhotoUrl",
          a."mapPhotoUrlBlurhash",
          a."duration",
          a."distance",
          a."steps",
          json_build_object(
            'surname', p."surname",
            'name', p."name",
            'profilePhoto', p."profilePhoto",
            'profilePhotoBlurhash', p."profilePhotoBlurhash",
            'emailNotifications', p."emailNotifications",
            'user', json_build_object('email', u."email")
          ) AS "profile",
          json_build_object(
            'comments', (
              SELECT COUNT(*)::int
              FROM "Comment" AS c
              WHERE c."activityId" = a."id"
            ),
            'likes', (
              SELECT COUNT(*)::int
              FROM "Like" AS l
              WHERE l."activityId" = a."id"
            )
          ) AS "_count"
        FROM "Activity" AS a
        INNER JOIN "Profile" AS p ON p."id" = a."profileId"
        INNER JOIN "Users" AS u ON u."id" = a."user_id"
        WHERE a."isPublic" IS TRUE
          AND (
            a."user_id" = ${id}::uuid
            OR EXISTS (
              SELECT 1
              FROM "Friend" AS f
              WHERE f."user_id" = ${id}::uuid
                AND f."friendId" = a."user_id"
            )
          )
          AND (
            ${cursor === undefined}
            OR a."date" < ${cursor?.date ?? null}
            OR (
              a."date" = ${cursor?.date ?? null}
              AND a."id" < ${cursor?.id ?? null}::uuid
            )
          )
        ORDER BY a."date" DESC, a."id" DESC
        LIMIT ${Number(take) + 1}::int
      `;
      const hasMore = activitiesWithExtraItem.length > Number(take);
      const activities = activitiesWithExtraItem.slice(0, Number(take));
      return {
        activities,
        hasMore,
        nextCursor: hasMore && activities.length ? encodeActivityCursor(activities.at(-1)!) : null,
        isLastPage: !hasMore,
      };
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
