import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { StatisticController } from './statistic.controller';
import { StatisticService } from './statistic.service';
import { ActivityModule } from 'src/activity/activity.module';
import { AccountModule } from 'src/account/account.module';
import { ActivityMetricsService } from './activity-metrics.service';

@Module({
  imports: [PrismaModule, ActivityModule, AccountModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [StatisticController],
  providers: [StatisticService, ActivityMetricsService],
})
export class StatisticModule {}
