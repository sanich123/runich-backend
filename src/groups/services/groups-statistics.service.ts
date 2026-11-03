import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationAccessService } from 'src/moderation/services/moderation-access.service';
import { ActivityMetricsService } from 'src/statistic/activity-metrics.service';
import { DEFAULT_TIME_ZONE, getLocalDateParts } from 'src/common/utils/time-zone';
import { createGroupPage, encodeGroupDistanceCursor } from '../shared/groups.pagination';
import type { GroupDistanceCursor } from '../shared/groups.pagination';

@Injectable()
export class GroupsStatisticsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModerationAccessService) private readonly moderationAccess: ModerationAccessService,
  ) {}
  private readonly activityMetrics = new ActivityMetricsService();

  async getMonthlyLeaderboard(
    userId: string,
    groupId: string,
    year?: number,
    month?: number,
    timeZone = DEFAULT_TIME_ZONE,
    pageSize = 100,
    cursor?: GroupDistanceCursor,
    paginationRequested = false,
  ) {
    try {
      const group: { id: string; privacy: 'open' | 'closed'; members: Array<{ status: string }> } | null =
        await this.prisma.group.findUnique({
          where: { id: groupId },
          select: { id: true, privacy: true, members: { where: { userId }, select: { status: true } } },
        });
      if (!group) throw new NotFoundException('Group not found');
      if (group.privacy === 'closed' && group.members[0]?.status !== 'active') {
        throw new ForbiddenException('Join this group to view member statistics');
      }

      const currentLocalDate = getLocalDateParts(new Date(), timeZone);
      const selectedYear = year ?? currentLocalDate.year;
      const selectedMonth = month ?? currentLocalDate.month - 1;
      const { gte, lt } = this.activityMetrics.localMonthRange(selectedYear, selectedMonth, timeZone);
      const blockedIds = await this.moderationAccess.blockedUserIds(userId);
      const rows = await this.prisma.$queryRaw<
        Array<{
          userId: string;
          name: string | null;
          surname: string | null;
          city: string | null;
          profilePhoto: string | null;
          totalDistance: number;
        }>
      >`
        SELECT
          gm."user_id"::text AS "userId",
          p."name" AS "name",
          p."surname" AS "surname",
          CASE WHEN p."profile_search_visible" IS TRUE THEN p."city" ELSE NULL END AS "city",
          CASE WHEN p."hide_profile_photos" IS TRUE THEN NULL ELSE p."profilePhoto" END AS "profilePhoto",
          COALESCE(SUM(a."distance"), 0)::double precision AS "totalDistance"
        FROM "GroupMember" gm
        LEFT JOIN "Profile" p ON p."user_id" = gm."user_id"
        LEFT JOIN "Activity" a
          ON a."user_id" = gm."user_id"
          AND a."date" >= ${gte}::timestamptz
          AND a."date" < ${lt}::timestamptz
          AND a."visibility" = 'public'
          AND a."moderation_status" = 'visible'
          AND a."route_storage_key" IS NOT NULL
          AND a."route_point_count" > 1
        WHERE gm."group_id" = ${groupId}::uuid
          AND gm."status" = 'active'
          AND p."hide_activity_statistics" IS DISTINCT FROM TRUE
          AND NOT (gm."user_id" = ANY(${blockedIds}::uuid[]))
        GROUP BY gm."user_id", p."name", p."surname", p."city", p."profilePhoto", p."profile_search_visible", p."hide_profile_photos"
        HAVING COALESCE(SUM(a."distance"), 0) > 0
          AND (
            ${cursor?.totalDistance ?? null}::double precision IS NULL
            OR COALESCE(SUM(a."distance"), 0) < ${cursor?.totalDistance ?? null}::double precision
            OR (
              COALESCE(SUM(a."distance"), 0) = ${cursor?.totalDistance ?? null}::double precision
              AND gm."user_id" > ${cursor?.userId ?? null}::uuid
            )
          )
        ORDER BY "totalDistance" DESC, gm."user_id" ASC
        LIMIT ${paginationRequested ? pageSize + 1 : 100}
      `;
      const mapRow = (row: (typeof rows)[number]) => ({
        userId: row.userId,
        profile:
          row.name || row.surname || row.city || row.profilePhoto
            ? { name: row.name, surname: row.surname, city: row.city, profilePhoto: row.profilePhoto }
            : null,
        totalDistance: Number(row.totalDistance),
      });

      if (!paginationRequested) return { year: selectedYear, month: selectedMonth, timeZone, items: rows.map(mapRow) };
      const page = createGroupPage(rows, pageSize, (lastMember) =>
        encodeGroupDistanceCursor({ totalDistance: Number(lastMember.totalDistance), userId: lastMember.userId }),
      );
      return {
        year: selectedYear,
        month: selectedMonth,
        timeZone,
        ...page,
        items: page.items.map(mapRow),
      };
    } catch (error) {
      handleServiceError(error);
    }
  }
}
