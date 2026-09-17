import { Injectable } from '@nestjs/common';
import { getLocalMonthRange, getLocalYearRange } from 'src/common/utils/time-zone';

@Injectable()
export class ActivityMetricsService {
  localYearRange(year: number, timeZone: string) {
    return getLocalYearRange(year, timeZone);
  }

  localMonthRange(year: number, month: number, timeZone: string) {
    return getLocalMonthRange(year, month, timeZone);
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
