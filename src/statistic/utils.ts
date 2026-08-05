export enum YearCategoryProps {
  all = 'all',
  totalDuration = 'totalDuration',
  totalDistance = 'totalDistance',
  totalItems = 'totalItems',
}

interface StatisticsNode {
  [key: string]: number | StatisticsNode;
}

function ensureNode(parent: StatisticsNode, key: string): StatisticsNode {
  const value = parent[key];
  if (typeof value === 'object' && value !== null) {
    return value;
  }

  const node: StatisticsNode = {};
  parent[key] = node;
  return node;
}

function addMetric(bucket: StatisticsNode, key: string, value: number) {
  const current = bucket[key];
  bucket[key] = typeof current === 'number' ? current + value : value;
}

export function reduceAllMetricsToYearCategoryMonths(
  acc: StatisticsNode,
  { date, duration, distance, sport }: { date: Date; duration: number; distance: number; sport: string },
) {
  const { all, totalDuration, totalDistance, totalItems } = YearCategoryProps;
  const newDate = new Date(date);
  const year = newDate.getFullYear();
  const month = newDate.getMonth();
  const durationInHours = duration / 3600000;
  const distanceInKm = distance / 1000;

  const yearStats = ensureNode(acc, String(year));
  const allStats = ensureNode(yearStats, all);
  const allMonthStats = ensureNode(allStats, String(month));
  const sportStats = ensureNode(yearStats, sport);
  const sportMonthStats = ensureNode(sportStats, String(month));

  addMetric(allMonthStats, totalDuration, durationInHours);
  addMetric(allMonthStats, totalDistance, distanceInKm);
  addMetric(allMonthStats, totalItems, 1);
  addMetric(allStats, totalDuration, durationInHours);
  addMetric(allStats, totalDistance, distanceInKm);
  addMetric(allStats, totalItems, 1);
  addMetric(sportStats, totalDuration, durationInHours);
  addMetric(sportStats, totalDistance, distanceInKm);
  addMetric(sportStats, totalItems, 1);
  addMetric(sportMonthStats, totalDuration, durationInHours);
  addMetric(sportMonthStats, totalDistance, distanceInKm);
  addMetric(sportMonthStats, totalItems, 1);
  return acc;
}
