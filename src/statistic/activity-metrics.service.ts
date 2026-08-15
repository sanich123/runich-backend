import { Injectable } from '@nestjs/common';

@Injectable()
export class ActivityMetricsService {
  utcYearRange(year: number) {
    return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
  }

  utcMonthRange(year: number, month: number) {
    return { gte: new Date(Date.UTC(year, month, 1)), lt: new Date(Date.UTC(year, month + 1, 1)) };
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
