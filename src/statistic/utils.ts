import type { StatisticsNode, YearCategoryAggregate } from './type';

enum YearCategoryProps {
  all = 'all',
  totalDuration = 'totalDuration',
  totalDistance = 'totalDistance',
  totalItems = 'totalItems',
  totalSteps = 'totalSteps',
  totalCaloriesActive = 'totalCaloriesActive',
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

export function buildYearCategoryStatistics(rows: YearCategoryAggregate[]) {
  const { all, totalDuration, totalDistance, totalItems, totalSteps, totalCaloriesActive } = YearCategoryProps;

  return rows.reduce<StatisticsNode>((acc, row) => {
    const yearStats = ensureNode(acc, String(row.year));
    const allStats = ensureNode(yearStats, all);
    const allMonthStats = ensureNode(allStats, String(row.month));
    const sportStats = ensureNode(yearStats, row.sport);
    const sportMonthStats = ensureNode(sportStats, String(row.month));

    addMetric(allMonthStats, totalDuration, row.totalDuration);
    addMetric(allMonthStats, totalDistance, row.totalDistance);
    addMetric(allMonthStats, totalItems, row.totalItems);
    addMetric(allMonthStats, totalSteps, row.totalSteps);
    addMetric(allMonthStats, totalCaloriesActive, row.totalCaloriesActive);
    addMetric(allStats, totalDuration, row.totalDuration);
    addMetric(allStats, totalDistance, row.totalDistance);
    addMetric(allStats, totalItems, row.totalItems);
    addMetric(allStats, totalSteps, row.totalSteps);
    addMetric(allStats, totalCaloriesActive, row.totalCaloriesActive);
    addMetric(sportStats, totalDuration, row.totalDuration);
    addMetric(sportStats, totalDistance, row.totalDistance);
    addMetric(sportStats, totalItems, row.totalItems);
    addMetric(sportStats, totalSteps, row.totalSteps);
    addMetric(sportStats, totalCaloriesActive, row.totalCaloriesActive);
    addMetric(sportMonthStats, totalDuration, row.totalDuration);
    addMetric(sportMonthStats, totalDistance, row.totalDistance);
    addMetric(sportMonthStats, totalItems, row.totalItems);
    addMetric(sportMonthStats, totalSteps, row.totalSteps);
    addMetric(sportMonthStats, totalCaloriesActive, row.totalCaloriesActive);

    return acc;
  }, {});
}
