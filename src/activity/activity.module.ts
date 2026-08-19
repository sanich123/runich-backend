import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { FriendModule } from '../friend/friend.module';
import { AccountModule } from '../account/account.module';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [PrismaModule, FriendModule, AccountModule],
  controllers: [ActivityController],
  providers: [ActivityService, ActivityPersistenceService, ThrottlerGuard],
  exports: [ActivityService, ActivityPersistenceService],
})
export class ActivityModule {}
