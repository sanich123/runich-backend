import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { access, mkdir, rm } from 'node:fs/promises';
import { ActivityService } from './activity.service';
import {
  ACTIVITY_MIGRATION_STATUS,
  ActivityMigrationJobResponseDto,
  ActivityMigrationStatus,
} from './activity-migration.dto';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { getMigrationWorkDirectory } from './activity-migration-storage';
import { unzipTransferArchive } from 'src/common/parsers/unzip-archive';
import { parseCsvFileIntoArray } from 'src/common/parsers/parse-csv';
import { mapActivitiesWithCoordinates } from 'src/common/parsers/map-activities-with-coordinates';

type EnqueueMigrationInput = {
  userId: string;
  profileId: string;
  archivePath: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 4000);
  return String(error).slice(0, 4000);
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
export class ActivityMigrationService implements OnModuleInit {
  private readonly logger = new Logger(ActivityMigrationService.name);
  private processingQueue = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
  ) {}

  async onModuleInit() {
    try {
      const jobs = await this.prisma.activityMigrationJob.findMany({
        where: { status: { in: [ACTIVITY_MIGRATION_STATUS.queued, ACTIVITY_MIGRATION_STATUS.processing] } },
        orderBy: { createdAt: 'asc' },
      });

      for (const job of jobs) {
        if (!(await fileExists(job.archivePath))) {
          await this.markFailed(job.id, 'Файл архива миграции не найден после перезапуска сервера');
          continue;
        }

        if (job.status === ACTIVITY_MIGRATION_STATUS.processing) {
          await this.prisma.activityMigrationJob.update({
            where: { id: job.id },
            data: {
              status: ACTIVITY_MIGRATION_STATUS.queued,
              processedActivities: 0,
              importedActivities: 0,
              skippedActivities: 0,
              startedAt: null,
              finishedAt: null,
              errorMessage: null,
            },
          });
        }
        this.schedule(job.id);
      }
    } catch (error) {
      this.logger.error('Не удалось восстановить задачи миграции', getErrorMessage(error));
    }
  }

  async enqueue(input: EnqueueMigrationInput) {
    const job = await this.prisma.activityMigrationJob.create({
      data: {
        user_id: input.userId,
        profileId: input.profileId,
        archivePath: input.archivePath,
        status: ACTIVITY_MIGRATION_STATUS.queued,
      },
    });

    this.schedule(job.id);
    return this.toResponse(job);
  }

  async getJobForUser(jobId: string, userId: string) {
    const job = await this.prisma.activityMigrationJob.findFirst({ where: { id: jobId, user_id: userId } });
    if (!job) throw new NotFoundException('Задача миграции не найдена');
    return this.toResponse(job);
  }

  private schedule(jobId: string) {
    setImmediate(() => {
      this.processingQueue = this.processingQueue
        .then(() => this.processJob(jobId))
        .catch((error) => this.logger.error(`Ошибка фоновой задачи миграции ${jobId}`, getErrorMessage(error)));
    });
  }

  private async processJob(jobId: string) {
    const claimed = await this.prisma.activityMigrationJob.updateMany({
      where: { id: jobId, status: ACTIVITY_MIGRATION_STATUS.queued },
      data: { status: ACTIVITY_MIGRATION_STATUS.processing, startedAt: new Date(), errorMessage: null },
    });
    if (claimed.count === 0) return;

    const job = await this.prisma.activityMigrationJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    const workDirectory = getMigrationWorkDirectory(job.id);
    let processedActivities = job.processedActivities;
    let importedActivities = job.importedActivities;
    let skippedActivities = job.skippedActivities;

    try {
      await mkdir(workDirectory, { recursive: true });
      const archiveStats = await unzipTransferArchive(job.archivePath, workDirectory);
      this.logger.log(
        `Migration job ${job.id}: ${archiveStats.compressedBytes} compressed bytes, ` +
          `${archiveStats.uncompressedBytes} uncompressed bytes, ${archiveStats.entries} entries`,
      );

      const parsedActivities = await parseCsvFileIntoArray(workDirectory);
      await this.prisma.activityMigrationJob.update({
        where: { id: job.id },
        data: { totalActivities: parsedActivities.length },
      });

      const activitiesWithCoordinates = await mapActivitiesWithCoordinates({
        parsedActivities,
        userId: job.user_id,
        profileId: job.profileId,
        migrationDirectory: workDirectory,
        onBatchProcessed: async (progress) => {
          processedActivities += progress.processed;
          importedActivities += progress.imported;
          skippedActivities += progress.skipped;

          if (processedActivities % 32 === 0 || processedActivities === parsedActivities.length) {
            await this.updateProgress(job.id, processedActivities, importedActivities, skippedActivities);
          }
        },
      });

      const result = await this.activityService.createActivitiesFromMigrationArchive(activitiesWithCoordinates);
      const persistedImportedActivities = result?.importedCount ?? activitiesWithCoordinates.length;
      await this.prisma.activityMigrationJob.update({
        where: { id: job.id },
        data: {
          status: ACTIVITY_MIGRATION_STATUS.completed,
          processedActivities,
          importedActivities: persistedImportedActivities,
          skippedActivities,
          finishedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      await this.markFailed(job.id, errorMessage, {
        processedActivities,
        importedActivities,
        skippedActivities,
      });
      this.logger.error(`Не удалось обработать задачу миграции ${job.id}`, errorMessage);
    } finally {
      await Promise.allSettled([
        rm(job.archivePath, { force: true }),
        rm(workDirectory, { recursive: true, force: true }),
      ]);
    }
  }

  private async updateProgress(
    jobId: string,
    processedActivities: number,
    importedActivities: number,
    skippedActivities: number,
  ) {
    await this.prisma.activityMigrationJob.update({
      where: { id: jobId },
      data: { processedActivities, importedActivities, skippedActivities },
    });
  }

  private async markFailed(
    jobId: string,
    errorMessage: string,
    progress?: { processedActivities: number; importedActivities: number; skippedActivities: number },
  ) {
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

  private toResponse(job: {
    id: string;
    status: string;
    totalActivities: number;
    processedActivities: number;
    importedActivities: number;
    skippedActivities: number;
    errorMessage: string | null;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  }): ActivityMigrationJobResponseDto {
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
