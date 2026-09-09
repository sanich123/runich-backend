export type LatencyCategory = 'db' | 'external' | 'http';

export type LatencySnapshot = {
  category: LatencyCategory;
  name: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
};
