import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { FriendModule } from '../friend/friend.module';
import { AccountModule } from '../account/account.module';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ActivityMigrationService } from './activity-migration.service';

@Module({
  imports: [PrismaModule, FriendModule, AccountModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [ActivityController],
  providers: [ActivityService, ActivityPersistenceService, ActivityMigrationService, ThrottlerGuard],
  exports: [ActivityService, ActivityPersistenceService, ActivityMigrationService],
})
export class ActivityModule {}
