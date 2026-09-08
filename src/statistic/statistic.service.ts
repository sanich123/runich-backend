import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { buildYearCategoryStatistics } from './utils';
import { ActivityMetricsService } from './activity-metrics.service';
import type { MetricAggregateRow, MonthlyMetricAggregateRow, YearCategoryMetricAggregateRow } from './type';

@Injectable()
export class StatisticService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ActivityMetricsService) metricsService?: ActivityMetricsService,
  ) {
    this.metricsService = metricsService ?? new ActivityMetricsService();
  }

  private readonly metricsService: ActivityMetricsService;

  private toMetricValue(value: number | string | null | undefined) {
    return Number(value ?? 0);
  }

  private toMetrics(row?: MetricAggregateRow) {
    return {
      totalDuration: this.toMetricValue(row?.totalDuration),
      totalDistance: this.toMetricValue(row?.totalDistance),
      totalItems: this.toMetricValue(row?.totalItems),
    };
  }

  async getYearsAndTypesOfActivities(id: string) {
    try {
      const rows = await this.prisma.$queryRaw<{ year: number; sport: string }[]>`
        SELECT
          EXTRACT(YEAR FROM ("date" AT TIME ZONE 'UTC'))::int AS "year",
          "sport"
        FROM "Activity"
        WHERE "user_id" = ${id}::uuid
        GROUP BY 1, "sport"
        ORDER BY 1, "sport"
      `;
      const years = new Map<number, string[]>();
      rows.forEach(({ year, sport }) => years.set(year, [...(years.get(year) ?? []), sport]));
      return [...years].map(([year, types]) => ({ year, types }));
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getMonthStatisticsByYearMonth(
    userId: string,
    year = `${new Date().getFullYear()}`,
    month = `${new Date().getMonth()}`,
  ) {
    try {
      const { gte, lt } = this.metricsService.utcMonthRange(+year, +month);
      const [activities, groupedMetrics] = await Promise.all([
        this.prisma.activity.findMany({
          where: { userId, date: { gte, lt } },
          select: {
            duration: true,
            distance: true,
            speed: true,
            date: true,
            id: true,
            sport: true,
          },
        }),
        this.prisma.$queryRaw<MonthlyMetricAggregateRow[]>`
          SELECT
            "sport",
            COALESCE(SUM("duration"), 0)::double precision AS "totalDuration",
            COALESCE(SUM("distance"), 0)::double precision AS "totalDistance",
            COUNT(*)::int AS "totalItems"
          FROM "Activity"
          WHERE "user_id" = ${userId}::uuid
            AND "date" >= ${gte}::timestamptz
            AND "date" < ${lt}::timestamptz
          GROUP BY ROLLUP ("sport")
          ORDER BY "sport" NULLS FIRST
        `,
      ]);
      const allMetrics = groupedMetrics.find(({ sport }) => sport === null);
      const sportsObject = Object.fromEntries(
        groupedMetrics
          .filter((row): row is MonthlyMetricAggregateRow & { sport: string } => row.sport !== null)
          .map(({ sport, ...metrics }) => [sport, this.toMetrics(metrics)]),
      );
      return {
        activities,
        activitiesReducedBySport: {
          all: this.toMetrics(allMetrics),
          ...sportsObject,
        },
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getActivitiesByYearMonthCategory(userId: string, year: string, month: string, category: string) {
    try {
      return await this.prisma.activity.findMany({
        where: {
          userId,
          date: {
            ...this.metricsService.utcMonthRange(+year, +month),
          },
          sport: category,
        },
        select: {
          duration: true,
          distance: true,
          speed: true,
        },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getStatisticByYearAndCategory(userId: string) {
    try {
      const rows = await this.prisma.$queryRaw<YearCategoryMetricAggregateRow[]>`
        SELECT
          EXTRACT(YEAR FROM ("date" AT TIME ZONE 'UTC'))::int AS "year",
          (EXTRACT(MONTH FROM ("date" AT TIME ZONE 'UTC')) - 1)::int AS "month",
          "sport",
          COALESCE(SUM("duration"), 0)::double precision / 3600000 AS "totalDuration",
          COALESCE(SUM("distance"), 0)::double precision / 1000 AS "totalDistance",
          COUNT(*)::int AS "totalItems"
        FROM "Activity"
        WHERE "user_id" = ${userId}::uuid
        GROUP BY 1, 2, "sport"
        ORDER BY 1, 2, "sport"
      `;
      if (!rows.length) {
        return { isUserHasActivities: false };
      }
      return {
        isUserHasActivities: true,
        ...buildYearCategoryStatistics(
          rows.map((row) => ({
            year: row.year,
            month: row.month,
            sport: row.sport,
            totalDuration: this.toMetricValue(row.totalDuration),
            totalDistance: this.toMetricValue(row.totalDistance),
            totalItems: this.toMetricValue(row.totalItems),
          })),
        ),
      };
    } catch (error) {
      handleServiceError(error);
    }
  }
  async getCurrentWeekStatistics(
    userId: string,
    firstDay = new Date().toISOString(),
    lastDay = new Date().toISOString(),
  ) {
    const firstDayDate = new Date(firstDay);
    const lastDayDate = new Date(lastDay);
    try {
      const firstDayUtc = new Date(
        Date.UTC(firstDayDate.getUTCFullYear(), firstDayDate.getUTCMonth(), firstDayDate.getUTCDate()),
      );
      const lastDayUtc = new Date(
        Date.UTC(lastDayDate.getUTCFullYear(), lastDayDate.getUTCMonth(), lastDayDate.getUTCDate() + 1),
      );
      const [row] = await this.prisma.$queryRaw<MetricAggregateRow[]>`
        SELECT
          COALESCE(SUM("duration"), 0)::double precision AS "totalDuration",
          COALESCE(SUM("distance"), 0)::double precision AS "totalDistance",
          COUNT(*)::int AS "totalItems"
        FROM "Activity"
        WHERE "user_id" = ${userId}::uuid
          AND "date" >= ${firstDayUtc}::timestamptz
          AND "date" < ${lastDayUtc}::timestamptz
      `;
      return this.toMetrics(row);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getAllActivitiesStatisticsByUserId(id: string) {
    try {
      const [row] = await this.prisma.$queryRaw<MetricAggregateRow[]>`
        SELECT
          COALESCE(SUM("duration"), 0)::double precision AS "totalDuration",
          COALESCE(SUM("distance"), 0)::double precision AS "totalDistance",
          COUNT(*)::int AS "totalItems"
        FROM "Activity"
        WHERE "user_id" = ${id}::uuid
      `;
      return this.toMetrics(row);
    } catch (error) {
      handleServiceError(error);
    }
  }

  reduceMetricsFromActivities(activities: { duration: number; distance: number }[]) {
    return this.metricsService.reduceMetricsFromActivities(activities);
  }
}
