import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { ModerationModule } from 'src/moderation/moderation.module';
import { StorageModule } from 'src/storage/storage.module';
import { GroupsController } from './groups.controller';
import { GroupsEventsService } from './services/groups-events.service';
import { GroupsMembersService } from './services/groups-members.service';
import { GroupsNotificationsService } from './services/groups-notifications.service';
import { GroupsPostsService } from './services/groups-posts.service';
import { GroupsStatisticsService } from './services/groups-statistics.service';
import { GroupSummaryService } from './services/groups-summary.service';
import { GroupsService } from './services/groups.service';

@Module({
  imports: [PrismaModule, ModerationModule, StorageModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [GroupsController],
  providers: [
    GroupsService,
    GroupSummaryService,
    GroupsMembersService,
    GroupsStatisticsService,
    GroupsPostsService,
    GroupsEventsService,
    GroupsNotificationsService,
  ],
  exports: [GroupsService],
})
export class GroupsModule {}
