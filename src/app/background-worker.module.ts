import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ActivityModule } from 'src/activity/activity.module';
import { ActivityMediaProcessingService } from 'src/activity/activity-media-processing.service';
import { ActivityEnrichmentService } from 'src/activity/activity-enrichment.service';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { StorageModule } from 'src/storage/storage.module';
import { LoadTestModule } from 'src/load-test/load-test.module';
import { observeImports } from 'src/common/observe/observe.config';
import { EmailNotificationModule } from 'src/email/email-notification.module';

@Module({
  imports: [
    ...observeImports,
    ThrottlerModule.forRoot([{ name: 'default', limit: 5, ttl: 60_000 }]),
    PrismaModule,
    StorageModule,
    ActivityModule,
    LoadTestModule,
    EmailNotificationModule,
  ],
  providers: [ActivityMediaProcessingService, ActivityEnrichmentService],
})
export class BackgroundWorkerModule {}
