import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setImmediate as yieldToEventLoop, setTimeout as delay } from 'node:timers/promises';
import { ACTIVITY_MIGRATION_STATUS, ActivityMigrationJobResponseDto, ActivityMigrationStatus } from './activity.dto';
import { getMigrationIncomingArchivePath, getMigrationWorkDirectory } from './activity-migration-storage';
import { generateActivityTitle } from './activity-title';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { mapActivitiesWithCoordinates } from 'src/common/parsers/map-activities-with-coordinates';
import { parseCsvFileIntoArray } from 'src/common/parsers/parse-csv';
import { unzipTransferArchive } from 'src/common/parsers/unzip-archive';
import { ACTIVITY_MIGRATION_CONFIG } from './activity-migration-config';
import type {
  EnqueueMigrationInput,
  MigratedActivity,
  MigrationJob,
  MigrationProgress,
  StartMigrationUploadInput,
} from './type';
import { fileExists, getMigrationErrorMessage } from './activity-migration.utils';
import { ActivityService } from './activity.service';
import { StorageService } from 'src/storage/storage.service';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';

@Injectable()
export class ActivityMigrationService {
  private readonly logger = new Logger(ActivityMigrationService.name);
  private readonly batchSize = ACTIVITY_MIGRATION_CONFIG.batchSize;
  private readonly batchPauseMs = ACTIVITY_MIGRATION_CONFIG.batchPauseMs;
  private readonly pollIntervalMs = ACTIVITY_MIGRATION_CONFIG.workerPollIntervalMs;
  private stopRequested = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {}

  async enqueue(input: EnqueueMigrationInput) {
    const migrationId = randomUUID();
    const archiveKey = (await this.storageService.uploadMigrationArchive(input.userId, migrationId, input.archivePath))
      .key;

    let job: MigrationJob;
    try {
      job = await this.prisma.activityMigrationJob.create({
        data: {
          userId: input.userId,
          profileId: input.profileId,
          // The legacy column is retained for compatibility, but now stores an
          // S3 object key rather than a path on the API container filesystem.
          archivePath: archiveKey,
          status: ACTIVITY_MIGRATION_STATUS.queued,
        },
      });
    } catch (error) {
      try {
        await this.storageService.deleteObjectByKey(archiveKey);
      } catch (cleanupError) {
        this.logger.error(
          `Не удалось удалить архив незавершённой миграции ${archiveKey}`,
          getMigrationErrorMessage(cleanupError),
        );
      }
      throw error;
    }

    return await this.toResponse(job);
  }

  async startUpload(input: StartMigrationUploadInput) {
    if (input.uploadBytesTotal > UPLOAD_LIMITS.migrationArchiveBytes) {
      throw new BadRequestException('Размер архива превышает допустимый лимит');
    }

    const job = await this.prisma.activityMigrationJob.create({
      data: {
        userId: input.userId,
        profileId: input.profileId,
        archivePath: null,
        status: ACTIVITY_MIGRATION_STATUS.uploading,
        uploadBytesReceived: 0,
        uploadBytesTotal: input.uploadBytesTotal,
        uploadUpdatedAt: new Date(),
      },
    });

    return await this.toResponse(job);
  }

  async updateUploadProgress(jobId: string, userId: string, uploadBytesReceived: number, uploadBytesTotal: number) {
    const result = await this.prisma.activityMigrationJob.updateMany({
      where: { id: jobId, userId, status: ACTIVITY_MIGRATION_STATUS.uploading },
      data: {
        uploadBytesReceived: Math.min(uploadBytesReceived, uploadBytesTotal),
        uploadBytesTotal,
        uploadUpdatedAt: new Date(),
      },
    });
    return result.count > 0;
  }

  async finishUpload(jobId: string, userId: string, archivePath: string) {
    const job = await this.prisma.activityMigrationJob.findFirst({ where: { id: jobId, userId } });
    if (!job) {
      await rm(archivePath, { force: true });
      throw new NotFoundException('Задача миграции не найдена');
    }
    if (job.status !== ACTIVITY_MIGRATION_STATUS.uploading) {
      await rm(archivePath, { force: true });
      return await this.toResponse(job);
    }

    let uploadedArchive: { key: string };
    try {
      uploadedArchive = await this.storageService.uploadMigrationArchive(userId, jobId, archivePath);
    } catch (error) {
      await this.markUploadFailed(jobId, userId, getMigrationErrorMessage(error));
      throw error;
    }

    const queued = await this.prisma.activityMigrationJob.updateMany({
      where: { id: jobId, userId, status: ACTIVITY_MIGRATION_STATUS.uploading },
      data: {
        archivePath: uploadedArchive.key,
        status: ACTIVITY_MIGRATION_STATUS.queued,
        uploadBytesReceived: job.uploadBytesTotal,
        uploadUpdatedAt: null,
        errorMessage: null,
      },
    });

    if (queued.count === 0) {
      await this.storageService.deleteObjectByKey(uploadedArchive.key);
    }

    return await this.getJobForUser(jobId, userId);
  }

  async markUploadFailed(jobId: string, userId: string, errorMessage: string) {
    await this.prisma.activityMigrationJob.updateMany({
      where: { id: jobId, userId, status: ACTIVITY_MIGRATION_STATUS.uploading },
      data: {
        status: ACTIVITY_MIGRATION_STATUS.failed,
        errorMessage,
        finishedAt: new Date(),
        uploadUpdatedAt: null,
      },
    });
  }

  async cancel(jobId: string, userId: string) {
    const job = await this.prisma.activityMigrationJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('Задача миграции не найдена');
    if (job.status === ACTIVITY_MIGRATION_STATUS.processing) {
      throw new ConflictException('Архив уже обрабатывается и его нельзя отменить');
    }
    if (job.status === ACTIVITY_MIGRATION_STATUS.completed || job.status === ACTIVITY_MIGRATION_STATUS.failed) {
      return await this.toResponse(job);
    }

    const cancelled = await this.prisma.activityMigrationJob.updateMany({
      where: {
        id: jobId,
        userId,
        status: { in: [ACTIVITY_MIGRATION_STATUS.uploading, ACTIVITY_MIGRATION_STATUS.queued] },
      },
      data: {
        status: ACTIVITY_MIGRATION_STATUS.cancelled,
        finishedAt: new Date(),
        uploadUpdatedAt: null,
      },
    });

    if (cancelled.count > 0) {
      await rm(getMigrationIncomingArchivePath(jobId), { force: true });
      if (job.archivePath && !isAbsolute(job.archivePath)) {
        await this.storageService.deleteObjectByKey(job.archivePath);
      }
    }

    return await this.getJobForUser(jobId, userId);
  }

  async getJobForUser(jobId: string, userId: string) {
    const job = await this.prisma.activityMigrationJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('Задача миграции не найдена');
    return await this.toResponse(await this.failStaleUpload(job));
  }

  async getCurrentJobForUser(userId: string) {
    const activeStatuses: string[] = [
      ACTIVITY_MIGRATION_STATUS.uploading,
      ACTIVITY_MIGRATION_STATUS.queued,
      ACTIVITY_MIGRATION_STATUS.processing,
    ];
    const job = await this.prisma.activityMigrationJob.findFirst({
      where: { userId, status: { in: activeStatuses } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!job) return null;

    const currentJob = await this.failStaleUpload(job);
    if (!activeStatuses.includes(currentJob.status)) return null;

    return await this.toResponse(currentJob);
  }

  private async failStaleUpload(job: MigrationJob) {
    if (job.status !== ACTIVITY_MIGRATION_STATUS.uploading) return job;
    const lastUploadActivity = getTimestamp(job.uploadUpdatedAt) ?? getTimestamp(job.createdAt) ?? Date.now();
    if (Date.now() - lastUploadActivity <= ACTIVITY_MIGRATION_CONFIG.uploadStaleAfterMs) return job;

    const errorMessage = 'Загрузка архива прервалась из-за отсутствия активности. Попробуйте снова.';
    const result = await this.prisma.activityMigrationJob.updateMany({
      where: { id: job.id, userId: job.userId, status: ACTIVITY_MIGRATION_STATUS.uploading },
      data: { status: ACTIVITY_MIGRATION_STATUS.failed, errorMessage, finishedAt: new Date(), uploadUpdatedAt: null },
    });
    return result.count > 0
      ? {
          ...job,
          status: ACTIVITY_MIGRATION_STATUS.failed,
          errorMessage,
          finishedAt: new Date(),
          uploadUpdatedAt: null,
        }
      : job;
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
        this.logger.error('Ошибка цикла worker миграции', getMigrationErrorMessage(error));
        await delay(this.pollIntervalMs);
      }
    }

    this.logger.log('Worker миграции остановлен');
  }

  async processNextJob() {
    const job = await this.prisma.activityMigrationJob.findFirst({
      where: { status: ACTIVITY_MIGRATION_STATUS.queued },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
      if (!job.archivePath) {
        await this.markFailed(job.id, 'Файл архива миграции не найден после перезапуска worker');
        continue;
      }

      if (isAbsolute(job.archivePath) && !(await fileExists(job.archivePath))) {
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
      if (isLegacyLocalArchive) {
        if (!(await fileExists(job.archivePath))) throw new Error('Файл архива миграции не найден');
      } else {
        await this.storageService.downloadObjectToFile(
          job.archivePath,
          downloadedArchivePath,
          'Файл архива миграции не найден',
        );
      }

      const archiveStats = await unzipTransferArchive(archivePath, workDirectory);
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

  private async toResponse(job: MigrationJob): Promise<ActivityMigrationJobResponseDto> {
    const queue = await this.getQueueInfo(job);
    return {
      jobId: job.id,
      status: job.status as ActivityMigrationStatus,
      uploadBytesReceived: job.uploadBytesReceived ?? 0,
      uploadBytesTotal: job.uploadBytesTotal ?? 0,
      ...queue,
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

  private async getQueueInfo(job: MigrationJob) {
    if (job.status !== ACTIVITY_MIGRATION_STATUS.queued && job.status !== ACTIVITY_MIGRATION_STATUS.processing) {
      return { queuePosition: null, queueAhead: 0, queueSize: 0 };
    }

    const [processingCount, queuedCount] = await Promise.all([
      this.prisma.activityMigrationJob.count({ where: { status: ACTIVITY_MIGRATION_STATUS.processing } }),
      this.prisma.activityMigrationJob.count({ where: { status: ACTIVITY_MIGRATION_STATUS.queued } }),
    ]);

    if (job.status === ACTIVITY_MIGRATION_STATUS.processing) {
      return { queuePosition: null, queueAhead: 0, queueSize: processingCount + queuedCount };
    }

    const queuedAhead = await this.prisma.activityMigrationJob.count({
      where: {
        status: ACTIVITY_MIGRATION_STATUS.queued,
        OR: [{ createdAt: { lt: job.createdAt } }, { createdAt: job.createdAt, id: { lt: job.id } }],
      },
    });
    const queueAhead = processingCount + queuedAhead;

    return {
      queuePosition: queueAhead + 1,
      queueAhead,
      queueSize: processingCount + queuedCount,
    };
  }
}

function getTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
