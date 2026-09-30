export interface MetricAggregateRow {
  totalDuration: number | string | null;
  totalDistance: number | string | null;
  totalItems: number | string | null;
}

export interface MonthlyMetricAggregateRow extends MetricAggregateRow {
  sport: string | null;
}

export interface YearCategoryMetricAggregateRow extends MetricAggregateRow {
  year: number;
  month: number;
  sport: string;
  totalSteps: number | string | null;
  totalCaloriesActive: number | string | null;
}

export interface YearCategoryAggregate {
  year: number;
  month: number;
  sport: string;
  totalDuration: number;
  totalDistance: number;
  totalItems: number;
  totalSteps: number;
  totalCaloriesActive: number;
}

export interface YearCategoryDailyActivity {
  duration: number;
  distance: number;
  steps: number;
  caloriesActive: number;
  date: string;
  sport: string;
}

export type YearCategoryDailyActivities = Record<string, YearCategoryDailyActivity[]>;

export interface StatisticsNode {
  [key: string]: number | StatisticsNode;
}
