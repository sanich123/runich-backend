import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ActivityAccessService } from './activity-access.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { ACTIVITY_CARD_SELECT, DEFAULT_ACTIVITY_PAGE_SIZE } from '../shared/const';
import { encodeActivityCursor, type ActivityCursor } from '../shared/activity.pagination';
import { ACTIVITY_VISIBILITY } from '../shared/activity-visibility';
import { normalizeActivityCardForViewer } from '../shared/utils';
import { ActivityContentReadService } from './activity-content-read.service';

@Injectable()
export class ActivityFeedService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ActivityAccessService) private readonly accessService: ActivityAccessService,
    @Inject(ActivityContentReadService) private readonly contentService: ActivityContentReadService,
  ) {}

  async getFavoriteActivities(
    currentUserId: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
  ) {
    try {
      const activitiesWithExtraItem = await this.prisma.activity.findMany({
        where: {
          userId: currentUserId,
          isFavorite: true,
          moderationStatus: 'visible',
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
      const activities = await Promise.all(
        activitiesWithExtraItem
          .slice(0, Number(take))
          .map(async (activity) =>
            normalizeActivityCardForViewer(
              await this.contentService.resolveActivityMediaForViewer(activity, currentUserId),
              currentUserId,
            ),
          ),
      );
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

  async getActivitesByUserId(
    id: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor?: ActivityCursor,
    currentUserId?: string,
  ) {
    try {
      const visibilityFilter = await this.accessService.getVisibilityFilter(id, currentUserId);
      const activitiesWithExtraItem = await this.prisma.activity.findMany({
        where: {
          userId: id,
          moderationStatus: 'visible',
          ...visibilityFilter,
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
      const activities = await Promise.all(
        activitiesWithExtraItem
          .slice(0, Number(take))
          .map(async (activity) =>
            normalizeActivityCardForViewer(
              await this.contentService.resolveActivityMediaForViewer(activity, currentUserId),
              currentUserId,
            ),
          ),
      );
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

  async getActivitiesByTheirIds(ids?: string | string[], currentUserId?: string) {
    const normalizedIds = (Array.isArray(ids) ? ids : [ids ?? ''])
      .flatMap((activityId) => activityId.split(','))
      .map((activityId) => activityId.trim())
      .filter(Boolean);
    if (!normalizedIds.length) return [];

    const searchByStringOrArray = normalizedIds.length === 1 ? normalizedIds[0] : { in: normalizedIds };
    try {
      const blockedUserIds = currentUserId ? await this.accessService.getBlockedUserIds(currentUserId) : [];
      const followedUsers = currentUserId
        ? await this.prisma.friend.findMany({ where: { userId: currentUserId }, select: { friendId: true } })
        : [];
      const followedUserIds = followedUsers.map((friend: { friendId: string }) => friend.friendId);
      const activities = await this.prisma.activity.findMany({
        where: {
          id: searchByStringOrArray,
          moderationStatus: 'visible',
          ...(blockedUserIds.length ? { userId: { notIn: blockedUserIds } } : {}),
          OR: [
            ...(currentUserId ? [{ userId: currentUserId }] : []),
            { visibility: ACTIVITY_VISIBILITY.public },
            ...(followedUserIds.length
              ? [{ userId: { in: followedUserIds }, visibility: ACTIVITY_VISIBILITY.followers }]
              : []),
          ],
        },
        orderBy: { date: 'desc' },
        select: ACTIVITY_CARD_SELECT,
      });
      return await Promise.all(
        activities.map(async (activity) =>
          normalizeActivityCardForViewer(
            await this.contentService.resolveActivityMediaForViewer(activity, currentUserId),
            currentUserId,
          ),
        ),
      );
    } catch (error) {
      handleServiceError(error);
    }
  }
}
