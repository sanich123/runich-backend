import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AuthenticatedRequest as RequestWithUser } from 'src/auth/request/auth-request';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { ActivityMigrationService } from './activity-migration.service';
import { getMigrationArchiveDirectory, getMigrationIncomingArchivePath } from '../shared/activity-migration.utils';

@Injectable()
export class MigrationArchiveUploadService {
  constructor(@Inject(ActivityMigrationService) private readonly migrations: ActivityMigrationService) {}

  async upload(request: RequestWithUser, jobId: string, userId: string) {
    const job = await this.migrations.getJobForUser(jobId, userId);
    if (job.status !== 'uploading') throw new ConflictException('Загрузка архива уже завершена или отменена');

    const contentLength = Number(request.headers['content-length'] ?? 0);
    const expectedBytes = job.uploadBytesTotal || contentLength;
    if (contentLength > UPLOAD_LIMITS.migrationArchiveBytes || expectedBytes > UPLOAD_LIMITS.migrationArchiveBytes) {
      throw new BadRequestException('Размер архива превышает допустимый лимит');
    }

    const archivePath = getMigrationIncomingArchivePath(jobId);
    await mkdir(getMigrationArchiveDirectory(), { recursive: true });
    let receivedBytes = 0;
    let lastReportedBytes = 0;
    let lastReportedAt = 0;
    let reportChain = Promise.resolve();
    const reportProgress = (force = false) => {
      const now = Date.now();
      if (!force && now - lastReportedAt < 500 && receivedBytes - lastReportedBytes < 1024 * 1024) {
        return reportChain;
      }
      lastReportedAt = now;
      lastReportedBytes = receivedBytes;
      reportChain = reportChain.then(async () => {
        await this.migrations.updateUploadProgress(jobId, userId, receivedBytes, expectedBytes);
      });
      return reportChain;
    };
    const countingStream = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        receivedBytes += chunk.length;
        if (receivedBytes > UPLOAD_LIMITS.migrationArchiveBytes || receivedBytes > expectedBytes) {
          callback(new BadRequestException('Размер архива не совпадает с заявленным размером'));
          return;
        }
        void reportProgress();
        callback(null, chunk);
      },
    });

    try {
      await pipeline(request, countingStream, createWriteStream(archivePath));
      await reportProgress(true);
      if (expectedBytes > 0 && receivedBytes !== expectedBytes) {
        throw new BadRequestException('Загрузка архива завершилась не полностью');
      }
      return await this.migrations.finishUpload(jobId, userId, archivePath);
    } catch (error) {
      await rm(archivePath, { force: true });
      await this.migrations
        .markUploadFailed(jobId, userId, error instanceof Error ? error.message : 'Загрузка архива прервана')
        .catch(() => undefined);
      throw error;
    }
  }
}
