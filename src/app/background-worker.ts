import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ActivityMediaProcessingService } from 'src/activity/activity-media-processing.service';
import { ActivityMigrationService } from 'src/activity/activity-migration.service';
import { MediaCleanupService } from 'src/storage/media-cleanup.service';
import { getAppEnvironment } from 'src/common/config/environment';
import { getLogLevels } from 'src/common/utils/log-levels';
import { BackgroundWorkerModule } from './background-worker.module';
import { LoadTestSeedService } from 'src/load-test/load-test.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(BackgroundWorkerModule, {
    logger: getLogLevels(getAppEnvironment() === 'production'),
  });
  const migrationService = app.get(ActivityMigrationService);
  const mediaProcessingService = app.get(ActivityMediaProcessingService);
  const cleanupService = app.get(MediaCleanupService);
  const loadTestSeedService = app.get(LoadTestSeedService);
  const stopWorker = () => {
    migrationService.requestStop();
    mediaProcessingService.requestStop();
    cleanupService.requestStop();
    loadTestSeedService.requestStop();
  };

  process.once('SIGINT', stopWorker);
  process.once('SIGTERM', stopWorker);

  try {
    await Promise.all([
      migrationService.runWorker(),
      mediaProcessingService.runWorker(),
      cleanupService.runWorker(),
      ...(getAppEnvironment() === 'production' ? [] : [loadTestSeedService.runWorker()]),
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
