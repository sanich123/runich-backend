import { Module } from '@nestjs/common';
import { ActivityMetricsService } from './activity-metrics.service';

@Module({
  providers: [ActivityMetricsService],
  exports: [ActivityMetricsService],
})
export class ActivityMetricsModule {}
