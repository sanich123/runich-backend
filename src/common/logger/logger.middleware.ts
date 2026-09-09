import { Inject, Injectable, Logger, NestMiddleware, Optional } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LatencyMetricsService, SLOW_REQUEST_THRESHOLD_MS } from 'src/common/metrics/latency-metrics.service';

@Injectable()
export default class LoggingService implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(@Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = performance.now();

    response.on('finish', () => {
      const { method, params } = request;
      const { statusCode, statusMessage } = response;
      const endpoint = request.route?.path ?? request.path;
      const durationMs = performance.now() - startedAt;
      this.latencyMetrics?.observeHttp(`${method} ${endpoint}`, durationMs);

      if (durationMs <= SLOW_REQUEST_THRESHOLD_MS && statusCode < 400) return;

      const message = `${method} ${endpoint} ${params.id ?? 'no params'} ${statusMessage} ${durationMs.toFixed(1)}ms`;

      if (statusCode >= 500) {
        return this.logger.error(message);
      }

      if (statusCode >= 400) {
        return this.logger.warn(message);
      }

      return this.logger.log(message);
    });

    next();
  }
}
