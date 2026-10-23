import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ActivityMediaProcessingService } from 'src/activity/activity-media-processing.service';
import { ActivityEnrichmentService } from 'src/activity/activity-enrichment.service';
import { ActivityMigrationService } from 'src/activity/activity-migration.service';
import { MediaCleanupService } from 'src/storage/media-cleanup.service';
import { getAppEnvironment } from 'src/common/config/environment';
import { getLogLevels } from 'src/common/utils/log-levels';
import { BackgroundWorkerModule } from './background-worker.module';
import { LoadTestSeedService } from 'src/load-test/load-test.service';
import { observeInstrument } from 'src/common/observe/observe.config';
import { EmailNotificationWorkerService } from 'src/email/email-notification-worker.service';
import { PushNotificationWorkerService } from 'src/notification/push-notification-worker.service';
import { MediaModerationWorkerService } from 'src/storage/media-moderation-worker.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(BackgroundWorkerModule, {
    logger: getLogLevels(getAppEnvironment() === 'production'),
    ...(observeInstrument ? { instrument: observeInstrument } : {}),
  });
  const migrationService = app.get(ActivityMigrationService);
  const mediaProcessingService = app.get(ActivityMediaProcessingService);
  const enrichmentService = app.get(ActivityEnrichmentService);
  const cleanupService = app.get(MediaCleanupService);
  const loadTestSeedService = app.get(LoadTestSeedService);
  const emailNotificationWorkerService = app.get(EmailNotificationWorkerService);
  const pushNotificationWorkerService = app.get(PushNotificationWorkerService);
  const mediaModerationWorkerService = app.get(MediaModerationWorkerService);
  const stopWorker = () => {
    migrationService.requestStop();
    mediaProcessingService.requestStop();
    enrichmentService.requestStop();
    cleanupService.requestStop();
    loadTestSeedService.requestStop();
    emailNotificationWorkerService.requestStop();
    pushNotificationWorkerService.requestStop();
    mediaModerationWorkerService.requestStop();
  };

  process.once('SIGINT', stopWorker);
  process.once('SIGTERM', stopWorker);

  try {
    await Promise.all([
      migrationService.runWorker(),
      mediaProcessingService.runWorker(),
      enrichmentService.runWorker(),
      cleanupService.runWorker(),
      ...(getAppEnvironment() === 'production' ? [] : [loadTestSeedService.runWorker()]),
      emailNotificationWorkerService.runWorker(),
      pushNotificationWorkerService.runWorker(),
      mediaModerationWorkerService.runWorker(),
    ]);
  } finally {
    process.off('SIGINT', stopWorker);
    process.off('SIGTERM', stopWorker);
    await app.close();
  }
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('BackgroundWorkerBootstrap');
  logger.error('Фоновый worker не удалось запустить', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
