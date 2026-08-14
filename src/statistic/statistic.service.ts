import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/prisma-errors';
import { reduceAllMetricsToYearCategoryMonths } from './utils';

@Injectable()
export class StatisticService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getYearsAndTypesOfActivities(id: string) {
    try {
      const activities = await this.prisma.activity.findMany({ where: { user_id: id }, select: { date: true } });
      const years = [...new Set(activities.map(({ date }) => date.getFullYear()))];
      return await Promise.all(
        years.map(async (year) => {
          const types = await this.prisma.activity.findMany({
            where: {
              date: {
                gte: new Date(year as number, 0, 1, 0, 0, 0),
                lte: new Date(year as number, 11, 31, 23, 59, 59),
              },
            },
            select: { sport: true },
          });
          return { year, types: [...new Set(types.map(({ sport }) => sport))] };
        }),
      );
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
      const activities = await this.prisma.activity.findMany({
        where: {
          user_id: userId,
          date: {
            gte: new Date(+year, +month, 1, 0, 0, 0),
            lte: new Date(+year, +month, 31, 23, 59, 59),
          },
        },
        select: {
          duration: true,
          distance: true,
          speed: true,
          date: true,
          id: true,
          sport: true,
        },
      });
      const typesOfSport = [...new Set(activities.map(({ sport }) => sport))];
      const sportsObject: Record<string, { totalDuration: number; totalDistance: number; totalItems: number }> = {};
      typesOfSport.forEach((type) => {
        const filteredActivitiesByType = activities.filter(({ sport }) => sport === type);
        const { totalDuration, totalDistance, totalItems } = this.reduceMetricsFromActivities(filteredActivitiesByType);
        sportsObject[type as string] = {
          totalDuration,
          totalDistance,
          totalItems,
        };
      });
      const { totalDuration, totalDistance, totalItems } = this.reduceMetricsFromActivities(activities);
      return {
        activities,
        activitiesReducedBySport: {
          all: {
            totalDuration,
            totalDistance,
            totalItems,
          },
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
          user_id: userId,
          date: {
            gte: new Date(+year, +month, 1, 0, 0, 0),
            lte: new Date(+year, +month, 31, 23, 59, 59),
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
      const activities = await this.prisma.activity.findMany({
        where: { user_id: userId },
        select: {
          date: true,
          duration: true,
          distance: true,
          speed: true,
          sport: true,
        },
      });
      if (!activities.length) {
        return { isUserHasActivities: false };
      }
      return { isUserHasActivities: true, ...activities.reduce(reduceAllMetricsToYearCategoryMonths, {}) };
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
      const currentWeekActivities = await this.prisma.activity.findMany({
        where: {
          user_id: userId,
          date: {
            gte: new Date(firstDayDate.getFullYear(), firstDayDate.getMonth(), firstDayDate.getDate(), 0, 0, 0),
            lte: new Date(lastDayDate.getFullYear(), lastDayDate.getMonth(), lastDayDate.getDate(), 23, 59, 59),
          },
        },
      });
      const { totalDuration, totalDistance, totalItems } = this.reduceMetricsFromActivities(currentWeekActivities);
      return { totalDuration, totalDistance, totalItems };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getAllActivitiesStatisticsByUserId(id: string) {
    try {
      const activities = await this.prisma.activity.findMany({
        where: { user_id: id },
        select: { duration: true, distance: true },
      });
      const { totalDistance, totalDuration, totalItems } = this.reduceMetricsFromActivities(activities);
      return { totalDistance, totalDuration, totalItems };
    } catch (error) {
      handleServiceError(error);
    }
  }

  reduceMetricsFromActivities(activities: { duration: number; distance: number }[]) {
    const safeActivities = Array.isArray(activities) ? activities : [];
    const { totalDistance, totalDuration } = safeActivities.reduce(
      (acc, { distance, duration }) => {
        acc.totalDistance += distance;
        acc.totalDuration += duration;
        return acc;
      },
      { totalDistance: 0, totalDuration: 0 },
    );
    return { totalDistance, totalDuration, totalItems: safeActivities.length };
  }
}
