import { Module } from '@nestjs/common';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { PrismaService } from './prisma.service';

@Module({
  providers: [LatencyMetricsService, PrismaService],
  exports: [LatencyMetricsService, PrismaService],
})
export class PrismaModule {}
