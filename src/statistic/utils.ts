import type { StatisticsNode, YearCategoryAggregate } from './type';

export enum YearCategoryProps {
  all = 'all',
  totalDuration = 'totalDuration',
  totalDistance = 'totalDistance',
  totalItems = 'totalItems',
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
  const { all, totalDuration, totalDistance, totalItems } = YearCategoryProps;

  return rows.reduce<StatisticsNode>((acc, row) => {
    const yearStats = ensureNode(acc, String(row.year));
    const allStats = ensureNode(yearStats, all);
    const allMonthStats = ensureNode(allStats, String(row.month));
    const sportStats = ensureNode(yearStats, row.sport);
    const sportMonthStats = ensureNode(sportStats, String(row.month));

    addMetric(allMonthStats, totalDuration, row.totalDuration);
    addMetric(allMonthStats, totalDistance, row.totalDistance);
    addMetric(allMonthStats, totalItems, row.totalItems);
    addMetric(allStats, totalDuration, row.totalDuration);
    addMetric(allStats, totalDistance, row.totalDistance);
    addMetric(allStats, totalItems, row.totalItems);
    addMetric(sportStats, totalDuration, row.totalDuration);
    addMetric(sportStats, totalDistance, row.totalDistance);
    addMetric(sportStats, totalItems, row.totalItems);
    addMetric(sportMonthStats, totalDuration, row.totalDuration);
    addMetric(sportMonthStats, totalDistance, row.totalDistance);
    addMetric(sportMonthStats, totalItems, row.totalItems);

    return acc;
  }, {});
}
