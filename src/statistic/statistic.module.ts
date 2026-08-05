import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StatisticController } from './statistic.controller';
import { StatisticService } from './statistic.service';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityModule } from 'src/activity/activity.module';
import { AccountModule } from 'src/account/account.module';

@Module({
  imports: [PrismaModule, ActivityModule, AccountModule],
  controllers: [StatisticController],
  providers: [StatisticService, ActivityService],
})
export class StatisticModule {}
