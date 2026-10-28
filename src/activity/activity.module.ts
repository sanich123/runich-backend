import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './services/activity.service';
import { ActivityAccessService } from './services/activity-access.service';
import { ActivityReadService } from './services/activity-read.service';
import { FriendModule } from '../friend/friend.module';
import { AccountModule } from '../account/account.module';
import { ActivityPersistenceService } from './services/activity-persistence.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ActivityMigrationService } from './services/activity-migration.service';
import { StorageModule } from 'src/storage/storage.module';
import { StaticMapService } from 'src/common/maps/static-map.service';
import { ModerationModule } from 'src/moderation/moderation.module';
import { ThrottlerReflector } from 'src/common/security/throttler-reflector';

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
    ThrottlerReflector,
  ],
  exports: [ActivityService, ActivityPersistenceService, ActivityMigrationService],
})
export class ActivityModule {}
