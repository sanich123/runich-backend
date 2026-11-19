import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { ModerationAccessService } from './services/moderation-access.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ModerationReportsService } from './services/moderation-reports.service';
import { ModerationReportsQueryService } from './services/moderation-reports-query.service';
import { ModerationEmailActionValidationService } from './services/moderation-email-action-validation.service';
import { ModerationAppealsService } from './services/moderation-appeals.service';
import { ModerationTargetsService } from './services/moderation-targets.service';
import { UserBlocksService } from './services/user-blocks.service';
import { ModeratorGuard } from './moderator.guard';
import { StorageModule } from 'src/storage/storage.module';
import { AdminModule } from 'src/admin/admin.module';
import { ThrottlerReflector } from 'src/common/security/throttler-reflector';
import { TextModerationWorkerService } from './services/text-moderation-worker.service';
import { TextModerationLocalClassifierService } from './services/text-moderation-local-classifier.service';
import { ModerationContentNotificationsService } from './services/moderation-content-notifications.service';

@Module({
  imports: [PrismaModule, StorageModule, AdminModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [ModerationController],
  providers: [
    ModerationAccessService,
    ModerationService,
    ModerationReportsService,
    ModerationReportsQueryService,
    ModerationEmailActionValidationService,
    ModerationAppealsService,
    ModerationTargetsService,
    UserBlocksService,
    ModeratorGuard,
    ThrottlerGuard,
    ThrottlerReflector,
    TextModerationLocalClassifierService,
    ModerationContentNotificationsService,
    TextModerationWorkerService,
  ],
  exports: [ModerationAccessService, TextModerationWorkerService],
})
export class ModerationModule {}
