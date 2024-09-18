import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { getReducedMetricsFromActivities, getYearMetricsFromActivities } from 'src/utils/statistics/reducers';

@Injectable()
export class StatisticService {
  constructor(private readonly prisma: PrismaService) {}

  async getYearsAndTypesOfActivities(id: string) {
    try {
      const activities = await this.prisma.activity.findMany({ where: { user_id: id }, select: { date: true } });
      const years = [...new Set(activities.map(({ date }) => date.getFullYear()))];
      return await Promise.all(
        years.map(async (year) => {
          const types = await this.prisma.activity.findMany({
            where: {
              date: {
                gte: new Date(year, 0, 1, 0, 0, 0),
                lte: new Date(year, 11, 31, 23, 59, 59),
              },
            },
            select: { sport: true },
          });
          return { year, types: [...new Set(types.map(({ sport }) => sport))] };
        }),
      );
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getMonthStatisticsByYearMonth(userId: string, year: string, month: string) {
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
      const sportsObject = {};
      typesOfSport.forEach((type) => {
        const filteredActivitiesByType = activities.filter(({ sport }) => sport === type);
        const { totalDuration, totalDistance, totalItems } = this.reduceMetricsFromActivities(filteredActivitiesByType);
        sportsObject[type] = {
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
      prismaErrorHandling(error);
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
      prismaErrorHandling(error);
    }
  }

  async getStatisticByYearAndCategory(userId: string) {
    try {
      const availableYearsAndTypes = await this.getYearsAndTypesOfActivities(userId);
      const allYearsAllCategoriesWithMonths = await Promise.all(
        availableYearsAndTypes.map(async ({ year, types }) => {
          return await Promise.all(
            types.map(async (type) => {
              const activitiesByMonth = await Promise.all(
                [...Array(12).keys()].map(async (month) => {
                  const findedActivities = await this.getActivitiesByYearMonthCategory(
                    userId,
                    `${year}`,
                    `${month}`,
                    type,
                  );
                  const { distanceInKm, durationInHours } = getReducedMetricsFromActivities(findedActivities);
                  return {
                    [month]: {
                      totalDistance: distanceInKm,
                      totalDuration: durationInHours,
                      medianSpeed: distanceInKm / durationInHours,
                      items: findedActivities?.length,
                    },
                  };
                }),
              );
              const { totalYearDuration, totalYearDistance, totalYearItems, averageYearSpeed } =
                getYearMetricsFromActivities(activitiesByMonth.map((item, i) => item[i]));
              return {
                year,
                [year]: {
                  [type]: {
                    months: activitiesByMonth,
                    totalYearDuration,
                    totalYearDistance,
                    totalYearItems,
                    totalMedianSpeed: averageYearSpeed,
                  },
                },
              };
            }),
          );
        }),
      );
      const mappedObjWithKeysYearAndType = {};

      allYearsAllCategoriesWithMonths.map((yearCategory) => {
        yearCategory.forEach((category) => {
          const year = category.year;
          mappedObjWithKeysYearAndType[year]
            ? (mappedObjWithKeysYearAndType[year] = { ...mappedObjWithKeysYearAndType[year], ...category[year] })
            : (mappedObjWithKeysYearAndType[year] = category[year]);
        });
      });

      return mappedObjWithKeysYearAndType;
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getCurrentWeekStatistics(userId: string, firstDay: string, lastDay: string) {
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
      prismaErrorHandling(error);
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
      prismaErrorHandling(error);
    }
  }

  reduceMetricsFromActivities(activities: { duration: number; distance: number }[]) {
    const { totalDistance, totalDuration } = activities?.reduce(
      (acc, { distance, duration }) => {
        acc.totalDistance += distance;
        acc.totalDuration += duration;
        return acc;
      },
      { totalDistance: 0, totalDuration: 0 },
    );
    return { totalDistance, totalDuration, totalItems: activities?.length };
  }
}
