import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ActivityContentReadService } from './activity-content-read.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { ACTIVITY_CARD_SELECT, DEFAULT_ACTIVITY_PAGE_SIZE } from '../shared/const';
import { encodeActivityCursor, type ActivityCursor } from '../shared/activity.pagination';
import { normalizeActivityCardForViewer } from '../shared/utils';
import type { ActivityRouteWorkoutFilters } from '../shared/types';
import { canonicalizeIanaTimeZone } from 'src/common/utils/time-zone';

@Injectable()
export class ActivityRouteFeedService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ActivityContentReadService) private readonly contentService: ActivityContentReadService,
  ) {}

  async getActivitiesWithRoutes(
    currentUserId: string,
    take = String(DEFAULT_ACTIVITY_PAGE_SIZE),
    cursor: ActivityCursor | undefined,
    filters: ActivityRouteWorkoutFilters,
  ) {
    try {
      const timeZone = canonicalizeIanaTimeZone(filters.timeZone);
      const pageSize = Number(take);
      const routeDateRows = await this.prisma.$queryRaw<Array<{ year: number; month: number; day: number }>>`
          SELECT DISTINCT
            EXTRACT(YEAR FROM ("date" AT TIME ZONE ${timeZone}))::int AS "year",
            EXTRACT(MONTH FROM ("date" AT TIME ZONE ${timeZone}))::int AS "month",
            EXTRACT(DAY FROM ("date" AT TIME ZONE ${timeZone}))::int AS "day"
          FROM "Activity"
          WHERE "user_id" = ${currentUserId}::uuid
            AND "moderation_status" = 'visible'
            AND "route_storage_key" IS NOT NULL
            AND "route_point_count" > 1
            AND (${filters.search === undefined} OR COALESCE("title", '') ILIKE ${`%${filters.search ?? ''}%`} OR "sport" ILIKE ${`%${filters.search ?? ''}%`})
        `;
      const availableFilters = {
        years: [
          ...new Set(
            routeDateRows
              .filter(
                ({ month, day }) =>
                  (filters.month === undefined || month === filters.month) &&
                  (filters.day === undefined || day === filters.day),
              )
              .map(({ year }) => year),
          ),
        ].sort((first, second) => second - first),
        months: [
          ...new Set(
            routeDateRows
              .filter(
                ({ year, day }) =>
                  (filters.year === undefined || year === filters.year) &&
                  (filters.day === undefined || day === filters.day),
              )
              .map(({ month }) => month),
          ),
        ].sort((first, second) => first - second),
        days: [
          ...new Set(
            routeDateRows
              .filter(
                ({ year, month }) =>
                  (filters.year === undefined || year === filters.year) &&
                  (filters.month === undefined || month === filters.month),
              )
              .map(({ day }) => day),
          ),
        ].sort((first, second) => first - second),
      };
      const dateFilterIds =
        filters.month !== undefined || filters.day !== undefined || filters.year !== undefined
          ? await this.prisma.$queryRaw<Array<{ id: string }>>`
              SELECT "id"
              FROM "Activity"
              WHERE "user_id" = ${currentUserId}::uuid
                AND "moderation_status" = 'visible'
                AND "route_storage_key" IS NOT NULL
                AND "route_point_count" > 1
                AND (${filters.year === undefined} OR EXTRACT(YEAR FROM ("date" AT TIME ZONE ${timeZone})) = ${filters.year ?? 0})
                AND (${filters.month === undefined} OR EXTRACT(MONTH FROM ("date" AT TIME ZONE ${timeZone})) = ${filters.month ?? 0})
                AND (${filters.day === undefined} OR EXTRACT(DAY FROM ("date" AT TIME ZONE ${timeZone})) = ${filters.day ?? 0})
            `
          : undefined;
      const activitiesWithExtraItem = await this.prisma.activity.findMany({
        where: {
          userId: currentUserId,
          moderationStatus: 'visible',
          routeStorageKey: { not: null },
          routePointCount: { gt: 1 },
          AND: [
            ...(filters.search
              ? [
                  {
                    OR: [
                      { title: { contains: filters.search, mode: 'insensitive' as const } },
                      { sport: { contains: filters.search, mode: 'insensitive' as const } },
                    ],
                  },
                ]
              : []),
            ...(dateFilterIds ? [{ id: { in: dateFilterIds.map(({ id }) => id) } }] : []),
            ...(cursor
              ? [
                  {
                    OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
        select: { ...ACTIVITY_CARD_SELECT, routePointCount: true },
      });
      const hasMore = activitiesWithExtraItem.length > pageSize;
      const activities = await Promise.all(
        activitiesWithExtraItem
          .slice(0, pageSize)
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
        availableFilters,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }
}
