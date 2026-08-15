import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { StatisticController } from './statistic.controller';
import { StatisticService } from './statistic.service';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityModule } from 'src/activity/activity.module';
import { AccountModule } from 'src/account/account.module';
import { ActivityMetricsService } from './activity-metrics.service';

@Module({
  imports: [PrismaModule, ActivityModule, AccountModule],
  controllers: [StatisticController],
  providers: [StatisticService, ActivityService, ActivityMetricsService],
})
export class StatisticModule {}
