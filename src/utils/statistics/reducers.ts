type Activity = {
  duration: number;
  distance: number;
  speed: number;
};

type ActivityByMonthStatistic = {
  totalDistance: number;
  totalDuration: number;
  medianSpeed: number;
  items: number;
};

export function getReducedMetricsFromActivities(activities: Activity[]) {
  const { totalDistance, totalDuration } = activities.reduce(
    (accum, { duration, distance }) => {
      accum.totalDistance += distance;
      accum.totalDuration += duration;
      return accum;
    },
    { totalDistance: 0, totalDuration: 0 },
  );
  const distanceInKm = Math.round(totalDistance / 1000);
  const durationInHours = Math.round(totalDuration / 3600000);
  return { distanceInKm, durationInHours };
}

export function getYearMetricsFromActivities(activities: ActivityByMonthStatistic[]) {
  const { totalYearDuration, totalYearDistance, totalYearItems } = activities.reduce(
    (acc, { totalDistance, totalDuration, items }) => {
      acc.totalYearDuration += totalDuration;
      acc.totalYearDistance += totalDistance;
      acc.totalYearItems += items;
      return acc;
    },
    {
      totalYearDuration: 0,
      totalYearDistance: 0,
      totalYearItems: 0,
    },
  );
  const averageYearSpeed = Math.round(totalYearDistance / totalYearDuration);
  return { totalYearDuration, totalYearDistance, totalYearItems, averageYearSpeed };
}
