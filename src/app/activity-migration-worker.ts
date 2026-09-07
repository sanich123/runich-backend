import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ActivityMigrationService } from 'src/activity/activity-migration.service';
import { getLogLevels } from 'src/common/utils/log-levels';
import { ActivityMigrationWorkerModule } from './activity-migration-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(ActivityMigrationWorkerModule, {
    logger: getLogLevels(process.env.NODE_ENV === 'production'),
  });
  const migrationService = app.get(ActivityMigrationService);
  const stopWorker = () => migrationService.requestStop();

  process.once('SIGINT', stopWorker);
  process.once('SIGTERM', stopWorker);

  try {
    await migrationService.runWorker();
  } finally {
    process.off('SIGINT', stopWorker);
    process.off('SIGTERM', stopWorker);
    await app.close();
  }
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('ActivityMigrationWorkerBootstrap');
  logger.error('Worker миграции не удалось запустить', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
