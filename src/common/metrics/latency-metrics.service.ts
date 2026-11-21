import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import { MAX_SAMPLES_PER_METRIC } from './const';
import { percentile } from './utils';
import type { LatencyCategory, LatencySnapshot } from './type';

@Injectable()
export class LatencyMetricsService {
  private readonly registry = new Registry();
  private readonly httpRequests = new Counter({
    name: 'runich_http_requests_total',
    help: 'Completed HTTP requests grouped by method, route template, and status class.',
    labelNames: ['method', 'route', 'status_class'],
    registers: [this.registry],
  });
  private readonly httpRequestDuration = new Histogram({
    name: 'runich_http_request_duration_seconds',
    help: 'HTTP request duration in seconds grouped by method, route template, and status class.',
    labelNames: ['method', 'route', 'status_class'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.3, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });
  private readonly operationDuration = new Histogram({
    name: 'runich_operation_duration_seconds',
    help: 'Database and external operation duration in seconds.',
    labelNames: ['category', 'operation'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });
  private readonly samples = new Map<string, number[]>();

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'runich_' });
  }

  observe(category: LatencyCategory, name: string, durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;

    if (category !== 'http') {
      this.operationDuration.observe({ category, operation: name }, durationMs / 1_000);
    }

    const key = `${category}:${name}`;
    const metricSamples = this.samples.get(key) ?? [];
    metricSamples.push(durationMs);
    if (metricSamples.length > MAX_SAMPLES_PER_METRIC) metricSamples.shift();
    this.samples.set(key, metricSamples);
  }

  observeHttp(endpoint: string, durationMs: number, statusCode?: number) {
    this.observe('http', endpoint, durationMs);

    if (statusCode === undefined || !Number.isInteger(statusCode) || statusCode < 100 || statusCode >= 600) return;

    const separatorIndex = endpoint.indexOf(' ');
    const method = separatorIndex < 0 ? 'UNKNOWN' : endpoint.slice(0, separatorIndex);
    const route = separatorIndex < 0 ? endpoint : endpoint.slice(separatorIndex + 1);
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    const labels = { method, route, status_class: statusClass };

    this.httpRequests.inc(labels);
    this.httpRequestDuration.observe(labels, durationMs / 1_000);
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

  getPrometheusMetrics() {
    return this.registry.metrics();
  }

  getPrometheusContentType() {
    return this.registry.contentType;
  }
}
