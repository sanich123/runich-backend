import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { ActivityAccessService } from './activity-access.service';
import { ActivityReadService } from './activity-read.service';
import { FriendModule } from '../friend/friend.module';
import { AccountModule } from '../account/account.module';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ActivityMigrationService } from './activity-migration.service';
import { StorageModule } from 'src/storage/storage.module';
import { StaticMapService } from 'src/common/maps/static-map.service';
import { ModerationModule } from 'src/moderation/moderation.module';

@Module({
  imports: [
    PrismaModule,
    FriendModule,
    AccountModule,
    StorageModule,
    ModerationModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [ActivityController],
  providers: [
    ActivityService,
    ActivityAccessService,
    ActivityReadService,
    ActivityPersistenceService,
    ActivityMigrationService,
    StaticMapService,
    ThrottlerGuard,
  ],
  exports: [ActivityService, ActivityPersistenceService, ActivityMigrationService],
})
export class ActivityModule {}
