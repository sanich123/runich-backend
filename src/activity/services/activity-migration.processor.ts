import { Logger } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { setImmediate as yieldToEventLoop, setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { mapActivitiesWithCoordinates } from 'src/common/parsers/map-activities-with-coordinates';
import { parseCsvFileIntoArray } from 'src/common/parsers/parse-csv';
import { unzipTransferArchive } from 'src/common/parsers/unzip-archive';
import { ACTIVITY_MIGRATION_CONFIG } from '../shared/const';
import { ACTIVITY_MIGRATION_STATUS } from '../dto/activity-response.dto';
import { generateActivityTitle } from '../shared/utils';
import { fileExists, getMigrationErrorMessage, getMigrationWorkDirectory } from '../shared/activity-migration.utils';
import type { MigratedActivity, MigrationJob, MigrationProgress } from '../shared/types';
import { ActivityService } from './activity.service';
import { StorageService } from 'src/storage/services/storage.service';

export class ActivityMigrationProcessor {
  private readonly logger = new Logger(ActivityMigrationProcessor.name);
  private readonly batchSize = ACTIVITY_MIGRATION_CONFIG.batchSize;
  private readonly batchPauseMs = ACTIVITY_MIGRATION_CONFIG.batchPauseMs;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly storageService: StorageService,
  ) {}

  async processJob(job: MigrationJob, isStopRequested: () => boolean) {
    if (!job.archivePath) {
      await this.markFailed(job.id, 'Файл архива миграции не найден');
      return;
    }

    const workDirectory = getMigrationWorkDirectory(job.id);
    const downloadedArchivePath = `${workDirectory}.zip`;
    const isLegacyLocalArchive = isAbsolute(job.archivePath);
    const archivePath = isLegacyLocalArchive ? job.archivePath : downloadedArchivePath;
    let preserveArchiveForResume = false;
    let progress: MigrationProgress = {
      processedActivities: job.processedActivities,
      importedActivities: job.importedActivities,
      skippedActivities: job.skippedActivities,
    };

    try {
      const downloadStartedAt = performance.now();
      if (isLegacyLocalArchive) {
        if (!(await fileExists(job.archivePath))) throw new Error('Файл архива миграции не найден');
      } else {
        await this.storageService.downloadObjectToFile(
          job.archivePath,
          downloadedArchivePath,
          'Файл архива миграции не найден',
        );
      }
      const downloadDurationMs = Math.round(performance.now() - downloadStartedAt);

      const unzipStartedAt = performance.now();
      const archiveStats = await unzipTransferArchive(archivePath, workDirectory);
      const unzipDurationMs = Math.round(performance.now() - unzipStartedAt);
      this.logger.log(
        `Migration job ${job.id}: ${archiveStats.compressedBytes} compressed bytes, ` +
          `${archiveStats.uncompressedBytes} uncompressed bytes, ${archiveStats.entries} entries, ` +
          `download=${downloadDurationMs}ms, unzip=${unzipDurationMs}ms`,
      );

      const csvStartedAt = performance.now();
      const parsedActivities = await parseCsvFileIntoArray(workDirectory);
      const csvDurationMs = Math.round(performance.now() - csvStartedAt);
      this.logger.log(`Migration job ${job.id}: csv=${csvDurationMs}ms, activities=${parsedActivities.length}`);
      if (progress.processedActivities > parsedActivities.length) {
        throw new Error('Сохранённый прогресс миграции превышает количество активностей в архиве');
      }

      await this.prisma.activityMigrationJob.update({
        where: { id: job.id },
        data: { totalActivities: parsedActivities.length },
      });

      for (let offset = progress.processedActivities; offset < parsedActivities.length; offset += this.batchSize) {
        if (isStopRequested()) {
          preserveArchiveForResume = true;
          await this.releaseForResume(job.id);
          return;
        }

        const sourceBatch = parsedActivities.slice(offset, offset + this.batchSize);
        const mappingStartedAt = performance.now();
        const mappedBatch = await mapActivitiesWithCoordinates({
          parsedActivities: sourceBatch,
          userId: job.userId,
          profileId: job.profileId,
          migrationDirectory: workDirectory,
          activityIndexOffset: offset,
        });
        const mappingDurationMs = Math.round(performance.now() - mappingStartedAt);

        const persistenceStartedAt = performance.now();
        progress = await this.persistBatch(job.id, sourceBatch.length, mappedBatch, progress);
        const persistenceDurationMs = Math.round(performance.now() - persistenceStartedAt);
        this.logger.log(
          `Migration job ${job.id}: batch=${offset + 1}-${offset + sourceBatch.length}, ` +
            `map=${mappingDurationMs}ms, persist=${persistenceDurationMs}ms, ` +
            `processed=${progress.processedActivities}/${parsedActivities.length}, ` +
            `imported=${progress.importedActivities}, skipped=${progress.skippedActivities}`,
        );

        if (isStopRequested()) {
          preserveArchiveForResume = true;
          await this.releaseForResume(job.id);
          return;
        }

        if (this.batchPauseMs > 0) await delay(this.batchPauseMs);
        else await yieldToEventLoop();
      }

      await this.prisma.activityMigrationJob.update({
        where: { id: job.id },
        data: {
          status: ACTIVITY_MIGRATION_STATUS.completed,
          ...progress,
          finishedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      const errorMessage = getMigrationErrorMessage(error);
      try {
        await this.markFailed(job.id, errorMessage, progress);
      } catch (statusError) {
        preserveArchiveForResume = true;
        this.logger.error(
          `Не удалось сохранить ошибку задачи миграции ${job.id}`,
          getMigrationErrorMessage(statusError),
        );
      }
      this.logger.error(`Не удалось обработать задачу миграции ${job.id}`, errorMessage);
    } finally {
      if (!preserveArchiveForResume) {
        const cleanupResults = await Promise.allSettled([
          ...(isLegacyLocalArchive
            ? [rm(job.archivePath, { force: true })]
            : [this.storageService.deleteObjectByKey(job.archivePath)]),
          ...(isLegacyLocalArchive ? [] : [rm(downloadedArchivePath, { force: true })]),
          rm(workDirectory, { recursive: true, force: true }),
        ]);
        cleanupResults.forEach((result) => {
          if (result.status === 'rejected') {
            this.logger.error(
              `Не удалось удалить временные файлы задачи миграции ${job.id}`,
              getMigrationErrorMessage(result.reason),
            );
          }
        });
      }

      if (!isLegacyLocalArchive) {
        const cleanupResult = await Promise.allSettled([rm(downloadedArchivePath, { force: true })]);
        cleanupResult.forEach((result) => {
          if (result.status === 'rejected') {
            this.logger.error(
              `Не удалось удалить временный архив задачи миграции ${job.id}`,
              getMigrationErrorMessage(result.reason),
            );
          }
        });
      }
    }
  }

  private async persistBatch(
    jobId: string,
    sourceBatchSize: number,
    activities: MigratedActivity[],
    progress: MigrationProgress,
  ): Promise<MigrationProgress> {
    const activitiesWithTitles = activities.map((activity) => ({
      ...activity,
      textModerationStatus:
        activity.title?.trim() || activity.description?.trim() ? ('pending' as const) : ('visible' as const),
      title: activity.title?.trim() ? activity.title : generateActivityTitle(activity.sport, activity.date),
    }));

    return await this.prisma.$transaction(async (transaction) => {
      const result = activitiesWithTitles.length
        ? await this.activityService.createActivitiesFromMigrationArchive(activitiesWithTitles, transaction)
        : { importedActivities: 0 };
      const importedActivities = result?.importedActivities ?? 0;
      const nextProgress = {
        processedActivities: progress.processedActivities + sourceBatchSize,
        importedActivities: progress.importedActivities + importedActivities,
        skippedActivities: progress.skippedActivities + sourceBatchSize - importedActivities,
      };

      await transaction.activityMigrationJob.update({
        where: { id: jobId },
        data: nextProgress,
      });
      return nextProgress;
    });
  }

  private async releaseForResume(jobId: string) {
    await this.prisma.activityMigrationJob.updateMany({
      where: { id: jobId, status: ACTIVITY_MIGRATION_STATUS.processing },
      data: { status: ACTIVITY_MIGRATION_STATUS.queued, startedAt: null },
    });
  }

  private async markFailed(jobId: string, errorMessage: string, progress?: MigrationProgress) {
    await this.prisma.activityMigrationJob.update({
      where: { id: jobId },
      data: {
        status: ACTIVITY_MIGRATION_STATUS.failed,
        errorMessage,
        finishedAt: new Date(),
        ...progress,
      },
    });
  }
}
