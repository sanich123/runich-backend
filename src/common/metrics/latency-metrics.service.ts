import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { MAX_SAMPLES_PER_METRIC, REPORT_INTERVAL_MS } from './const';
import { percentile } from './utils';
import type { LatencyCategory, LatencySnapshot } from './type';

@Injectable()
export class LatencyMetricsService implements OnModuleDestroy {
  private readonly logger = new Logger(LatencyMetricsService.name);
  private readonly samples = new Map<string, number[]>();
  private readonly reportTimer: NodeJS.Timeout;

  constructor() {
    this.reportTimer = setInterval(() => this.logReport(), REPORT_INTERVAL_MS);
    this.reportTimer.unref?.();
  }

  observe(category: LatencyCategory, name: string, durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;

    const key = `${category}:${name}`;
    const metricSamples = this.samples.get(key) ?? [];
    metricSamples.push(durationMs);
    if (metricSamples.length > MAX_SAMPLES_PER_METRIC) metricSamples.shift();
    this.samples.set(key, metricSamples);
  }

  observeHttp(endpoint: string, durationMs: number) {
    this.observe('http', endpoint, durationMs);
  }

  observeDatabase(operation: string, durationMs: number) {
    this.observe('db', operation, durationMs);
  }

  observeExternal(service: string, operation: string, durationMs: number) {
    this.observe('external', `${service}.${operation}`, durationMs);
  }

  getSnapshot(category: LatencyCategory, name: string): LatencySnapshot | null {
    const metricSamples = this.samples.get(`${category}:${name}`);
    if (!metricSamples?.length) return null;

    const sortedSamples = [...metricSamples].sort((left, right) => left - right);
    return {
      category,
      name,
      count: sortedSamples.length,
      p50: percentile(sortedSamples, 50),
      p95: percentile(sortedSamples, 95),
      p99: percentile(sortedSamples, 99),
    };
  }

  getSnapshots() {
    return [...this.samples.keys()]
      .map((key) => {
        const separatorIndex = key.indexOf(':');
        const category = key.slice(0, separatorIndex) as LatencyCategory;
        const name = key.slice(separatorIndex + 1);
        return this.getSnapshot(category, name);
      })
      .filter((snapshot): snapshot is LatencySnapshot => snapshot !== null);
  }

  onModuleDestroy() {
    clearInterval(this.reportTimer);
  }

  private logReport() {
    const snapshots = this.getSnapshots();
    if (!snapshots.length) return;

    this.logger.log(
      `Latency p50/p95/p99: ${snapshots
        .map(
          ({ category, name, count, p50, p95, p99 }) =>
            `${category}.${name} count=${count} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms`,
        )
        .join('; ')}`,
    );
  }
}
