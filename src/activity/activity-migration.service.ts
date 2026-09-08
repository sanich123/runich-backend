import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { access, rm } from 'node:fs/promises';
import { setImmediate as yieldToEventLoop, setTimeout as delay } from 'node:timers/promises';
import { ActivityDto } from './activity.dto';
import {
  ACTIVITY_MIGRATION_STATUS,
  ActivityMigrationJobResponseDto,
  ActivityMigrationStatus,
} from './activity-migration.dto';
import { getMigrationWorkDirectory } from './activity-migration-storage';
import { generateActivityTitle } from './activity-title';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { mapActivitiesWithCoordinates } from 'src/common/parsers/map-activities-with-coordinates';
import { parseCsvFileIntoArray } from 'src/common/parsers/parse-csv';
import { unzipTransferArchive } from 'src/common/parsers/unzip-archive';
import { ACTIVITY_MIGRATION_CONFIG } from './activity-migration-config';

type EnqueueMigrationInput = {
  userId: string;
  profileId: string;
  archivePath: string;
};

type MigrationJob = {
  id: string;
  userId: string;
  profileId: string;
  archivePath: string;
  status: string;
  totalActivities: number;
  processedActivities: number;
  importedActivities: number;
  skippedActivities: number;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type MigratedActivity = ActivityDto & {
  id: string;
  userId: string;
  profileId: string;
  source: 'strava';
  sourceActivityId: string;
};

type MigrationProgress = Pick<MigrationJob, 'processedActivities' | 'importedActivities' | 'skippedActivities'>;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 4_000);
  return String(error).slice(0, 4_000);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class ActivityMigrationService {
  private readonly logger = new Logger(ActivityMigrationService.name);
  private readonly batchSize = ACTIVITY_MIGRATION_CONFIG.batchSize;
  private readonly batchPauseMs = ACTIVITY_MIGRATION_CONFIG.batchPauseMs;
  private readonly pollIntervalMs = ACTIVITY_MIGRATION_CONFIG.workerPollIntervalMs;
  private stopRequested = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueMigrationInput) {
    const job = await this.prisma.activityMigrationJob.create({
      data: {
        userId: input.userId,
        profileId: input.profileId,
        archivePath: input.archivePath,
        status: ACTIVITY_MIGRATION_STATUS.queued,
      },
    });

    return this.toResponse(job);
  }

  async getJobForUser(jobId: string, userId: string) {
    const job = await this.prisma.activityMigrationJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('Задача миграции не найдена');
    return this.toResponse(job);
  }

  requestStop() {
    this.stopRequested = true;
  }

  async runWorker() {
    this.stopRequested = false;
    await this.requeueInterruptedJobs();
    this.logger.log(
      `Worker миграции запущен: batch=${this.batchSize}, pause=${this.batchPauseMs}ms, poll=${this.pollIntervalMs}ms`,
    );

    while (!this.stopRequested) {
      try {
        const foundJob = await this.processNextJob();
        if (!foundJob) await delay(this.pollIntervalMs);
      } catch (error) {
        this.logger.error('Ошибка цикла worker миграции', getErrorMessage(error));
        await delay(this.pollIntervalMs);
      }
    }

    this.logger.log('Worker миграции остановлен');
  }

  async processNextJob() {
    const job = await this.prisma.activityMigrationJob.findFirst({
      where: { status: ACTIVITY_MIGRATION_STATUS.queued },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return false;

    const startedAt = new Date();
    const claimed = await this.prisma.activityMigrationJob.updateMany({
      where: { id: job.id, status: ACTIVITY_MIGRATION_STATUS.queued },
      data: {
        status: ACTIVITY_MIGRATION_STATUS.processing,
        startedAt,
        finishedAt: null,
        errorMessage: null,
      },
    });
    if (claimed.count === 0) return true;

    await this.processJob({ ...job, status: ACTIVITY_MIGRATION_STATUS.processing, startedAt });
    return true;
  }

  private async requeueInterruptedJobs() {
    const interruptedJobs = await this.prisma.activityMigrationJob.findMany({
      where: { status: ACTIVITY_MIGRATION_STATUS.processing },
      orderBy: { createdAt: 'asc' },
    });

    for (const job of interruptedJobs) {
      if (!(await fileExists(job.archivePath))) {
        await this.markFailed(job.id, 'Файл архива миграции не найден после перезапуска worker');
        continue;
      }

      await this.prisma.activityMigrationJob.update({
        where: { id: job.id },
        data: {
          status: ACTIVITY_MIGRATION_STATUS.queued,
          startedAt: null,
          finishedAt: null,
          errorMessage: null,
        },
      });
    }
  }

  private async processJob(job: MigrationJob) {
    const workDirectory = getMigrationWorkDirectory(job.id);
    let preserveArchiveForResume = false;
    let progress: MigrationProgress = {
      processedActivities: job.processedActivities,
      importedActivities: job.importedActivities,
      skippedActivities: job.skippedActivities,
    };

    try {
      if (!(await fileExists(job.archivePath))) {
        throw new Error('Файл архива миграции не найден');
      }

      const archiveStats = await unzipTransferArchive(job.archivePath, workDirectory);
      this.logger.log(
        `Migration job ${job.id}: ${archiveStats.compressedBytes} compressed bytes, ` +
          `${archiveStats.uncompressedBytes} uncompressed bytes, ${archiveStats.entries} entries`,
      );

      const parsedActivities = await parseCsvFileIntoArray(workDirectory);
      if (progress.processedActivities > parsedActivities.length) {
        throw new Error('Сохранённый прогресс миграции превышает количество активностей в архиве');
      }

      await this.prisma.activityMigrationJob.update({
        where: { id: job.id },
        data: { totalActivities: parsedActivities.length },
      });

      for (let offset = progress.processedActivities; offset < parsedActivities.length; offset += this.batchSize) {
        if (this.stopRequested) {
          preserveArchiveForResume = true;
          await this.releaseForResume(job.id);
          return;
        }

        const sourceBatch = parsedActivities.slice(offset, offset + this.batchSize);
        const mappedBatch = await mapActivitiesWithCoordinates({
          parsedActivities: sourceBatch,
          userId: job.userId,
          profileId: job.profileId,
          migrationDirectory: workDirectory,
        });

        progress = await this.persistBatch(job.id, sourceBatch.length, mappedBatch, progress);
        this.logger.debug(
          `Migration job ${job.id}: processed=${progress.processedActivities}/${parsedActivities.length}, ` +
            `imported=${progress.importedActivities}, skipped=${progress.skippedActivities}`,
        );

        if (this.stopRequested) {
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
      const errorMessage = getErrorMessage(error);
      try {
        await this.markFailed(job.id, errorMessage, progress);
      } catch (statusError) {
        preserveArchiveForResume = true;
        this.logger.error(`Не удалось сохранить ошибку задачи миграции ${job.id}`, getErrorMessage(statusError));
      }
      this.logger.error(`Не удалось обработать задачу миграции ${job.id}`, errorMessage);
    } finally {
      if (!preserveArchiveForResume) {
        const cleanupResults = await Promise.allSettled([
          rm(job.archivePath, { force: true }),
          rm(workDirectory, { recursive: true, force: true }),
        ]);
        cleanupResults.forEach((result) => {
          if (result.status === 'rejected') {
            this.logger.error(
              `Не удалось удалить временные файлы задачи миграции ${job.id}`,
              getErrorMessage(result.reason),
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
      title: activity.title?.trim() ? activity.title : generateActivityTitle(activity.sport, activity.date),
    }));

    return await this.prisma.$transaction(async (transaction) => {
      const inserted = activitiesWithTitles.length
        ? await transaction.activity.createMany({ data: activitiesWithTitles as never, skipDuplicates: true })
        : { count: 0 };
      const nextProgress = {
        processedActivities: progress.processedActivities + sourceBatchSize,
        importedActivities: progress.importedActivities + inserted.count,
        skippedActivities: progress.skippedActivities + sourceBatchSize - inserted.count,
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

  private toResponse(job: MigrationJob): ActivityMigrationJobResponseDto {
    return {
      jobId: job.id,
      status: job.status as ActivityMigrationStatus,
      totalActivities: job.totalActivities,
      processedActivities: job.processedActivities,
      importedActivities: job.importedActivities,
      skippedActivities: job.skippedActivities,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  }
}
