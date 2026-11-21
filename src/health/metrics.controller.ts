import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';

@Controller()
export class MetricsController {
  constructor(@Inject(LatencyMetricsService) private readonly metrics: LatencyMetricsService) {}

  @Get('metrics')
  async metricsEndpoint(@Res() response: Response): Promise<void> {
    response.setHeader('Content-Type', this.metrics.getPrometheusContentType());
    response.setHeader('Cache-Control', 'no-store');
    response.send(await this.metrics.getPrometheusMetrics());
  }
}
