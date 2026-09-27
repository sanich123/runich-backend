import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { asyncMock } from 'src/tests/helpers';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

type MapInput = {
  parsedActivities?: Record<string, unknown>[];
  userId: string;
  profileId: string;
  migrationDirectory?: string;
};

type MigratedActivity = {
  id: string;
  userId: string;
  profileId: string;
  source: 'strava';
  sourceActivityId: string;
  date: string;
  title: string;
  sport: string;
  duration: number;
  distance: number;
  speed: number;
};

const access = asyncMock();
const mkdir = asyncMock();
const rm = asyncMock();
const stat = asyncMock();
const unzipTransferArchive = asyncMock();
const parseCsvFileIntoArray = asyncMock();
const mapActivitiesWithCoordinates = jest.fn<(input: MapInput) => Promise<MigratedActivity[]>>();
const createActivitiesFromMigrationArchive =
  jest.fn<(activities: unknown[], database: unknown) => Promise<{ success: true; importedActivities: number }>>();
const migrationJobCount = jest.fn<() => Promise<number>>();
const transactionJobUpdate = jest.fn<(input: unknown) => Promise<unknown>>();
type TransactionClient = {
  activity: Record<string, never>;
  activityMigrationJob: { update: typeof transactionJobUpdate };
};
const transaction = jest.fn<(callback: (client: TransactionClient) => Promise<unknown>) => Promise<unknown>>();

jest.unstable_mockModule('node:fs/promises', () => ({ access, mkdir, rm, stat }));
jest.unstable_mockModule('src/common/parsers/unzip-archive', () => ({ unzipTransferArchive }));
jest.unstable_mockModule('src/common/parsers/parse-csv', () => ({ parseCsvFileIntoArray }));
jest.unstable_mockModule('src/common/parsers/map-activities-with-coordinates', () => ({
  mapActivitiesWithCoordinates,
}));

const { ActivityMigrationService } = await import('../activity-migration.service');
const { ActivityService } = await import('../activity.service');

const prisma = {
  activityMigrationJob: {
    create: asyncMock(),
    findFirst: asyncMock(),
    findMany: asyncMock(),
    update: asyncMock(),
    updateMany: asyncMock(),
    count: migrationJobCount,
  },
  $transaction: transaction,
};

const storage = {
  uploadMigrationArchive: asyncMock(),
  downloadObjectToFile: asyncMock(),
  deleteObjectByKey: asyncMock(),
};

const queuedJob = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: 'user-1',
  profileId: 'profile-1',
  archivePath: '/tmp/archive.zip',
  status: 'queued',
  uploadBytesReceived: 0,
  uploadBytesTotal: 0,
  uploadUpdatedAt: null,
  totalActivities: 0,
  processedActivities: 0,
  importedActivities: 0,
  skippedActivities: 0,
  errorMessage: null,
  createdAt: new Date('2026-09-07T00:00:00.000Z'),
  startedAt: null,
  finishedAt: null,
};

function mappedActivity(sourceActivityId: string): MigratedActivity {
  return {
    id: `activity-${sourceActivityId}`,
    userId: 'user-1',
    profileId: 'profile-1',
    source: 'strava',
    sourceActivityId,
    date: '2026-09-07T00:00:00.000Z',
    title: 'Run',
    sport: 'run',
    duration: 60_000,
    distance: 1_000,
    speed: 6,
  };
}

describe('ActivityMigrationService', () => {
  let service: InstanceType<typeof ActivityMigrationService>;

  it('declares the Prisma injection token required by the ESM worker bootstrap', () => {
    expect(Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, ActivityMigrationService)).toEqual([
      { index: 2, param: expect.anything() },
      { index: 1, param: ActivityService },
      { index: 0, param: PrismaService },
    ]);
  });

  it('uses a ten-second polling interval by default', () => {
    const serviceWithDefaults = new ActivityMigrationService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
    );

    expect(serviceWithDefaults['pollIntervalMs']).toBe(10_000);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ActivityMigrationService(
      prisma as unknown as PrismaService,
      { createActivitiesFromMigrationArchive } as never,
      storage as never,
    );

    access.mockResolvedValue(undefined);
    rm.mockResolvedValue(undefined);
    unzipTransferArchive.mockResolvedValue({ compressedBytes: 100, uncompressedBytes: 200, entries: 4 });
    prisma.activityMigrationJob.create.mockResolvedValue(queuedJob);
    prisma.activityMigrationJob.findFirst.mockResolvedValue(queuedJob);
    prisma.activityMigrationJob.findMany.mockResolvedValue([]);
    prisma.activityMigrationJob.update.mockResolvedValue(queuedJob);
    prisma.activityMigrationJob.updateMany.mockResolvedValue({ count: 1 });
    storage.uploadMigrationArchive.mockResolvedValue({
      key: 'user-1/migrations/migration-1/archive.zip',
      url: 'https://s3.example/runich-test/user-1/migrations/migration-1/archive.zip',
    });
    storage.downloadObjectToFile.mockResolvedValue(undefined);
    storage.deleteObjectByKey.mockResolvedValue(undefined);
    migrationJobCount.mockResolvedValue(0);
    transactionJobUpdate.mockResolvedValue(queuedJob);
    transaction.mockImplementation(async (callback) =>
      callback({ activity: {}, activityMigrationJob: { update: transactionJobUpdate } }),
    );
    createActivitiesFromMigrationArchive.mockResolvedValue({ success: true, importedActivities: 1 });
    mapActivitiesWithCoordinates.mockImplementation(async ({ parsedActivities = [] }) =>
      parsedActivities.map((activity) => mappedActivity(String(activity['Activity ID']))),
    );
  });

  it('creates a durable queued job without starting work in the API process', async () => {
    await expect(
      service.enqueue({ userId: 'user-1', profileId: 'profile-1', archivePath: '/tmp/archive.zip' }),
    ).resolves.toMatchObject({ jobId: queuedJob.id, status: 'queued' });

    expect(prisma.activityMigrationJob.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        profileId: 'profile-1',
        archivePath: 'user-1/migrations/migration-1/archive.zip',
        status: 'queued',
      },
    });
    expect(storage.uploadMigrationArchive).toHaveBeenCalledWith('user-1', expect.any(String), '/tmp/archive.zip');
    expect(prisma.activityMigrationJob.findFirst).not.toHaveBeenCalled();
    expect(unzipTransferArchive).not.toHaveBeenCalled();
  });

  it('creates an upload job before bytes are sent to the API', async () => {
    const uploadJob = {
      ...queuedJob,
      archivePath: null,
      status: 'uploading',
      uploadBytesTotal: 70_000_000,
      uploadUpdatedAt: new Date(),
    };
    prisma.activityMigrationJob.create.mockResolvedValueOnce(uploadJob);

    await expect(
      service.startUpload({ userId: 'user-1', profileId: 'profile-1', uploadBytesTotal: 70_000_000 }),
    ).resolves.toMatchObject({ jobId: queuedJob.id, status: 'uploading', uploadBytesTotal: 70_000_000 });

    expect(prisma.activityMigrationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        profileId: 'profile-1',
        archivePath: null,
        status: 'uploading',
        uploadBytesReceived: 0,
        uploadBytesTotal: 70_000_000,
      }),
    });
  });

  it('cancels an upload job and prevents it from entering the worker queue', async () => {
    const uploadJob = {
      ...queuedJob,
      archivePath: null,
      status: 'uploading',
      uploadBytesTotal: 70_000_000,
      uploadUpdatedAt: new Date(),
    };
    prisma.activityMigrationJob.findFirst
      .mockResolvedValueOnce(uploadJob)
      .mockResolvedValueOnce({ ...uploadJob, status: 'cancelled', finishedAt: new Date() });
    prisma.activityMigrationJob.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(service.cancel(uploadJob.id, uploadJob.userId)).resolves.toMatchObject({ status: 'cancelled' });
    expect(prisma.activityMigrationJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: uploadJob.id,
        userId: uploadJob.userId,
        status: { in: ['uploading', 'queued'] },
      },
      data: expect.objectContaining({ status: 'cancelled' }),
    });
  });

  it('downloads an S3 archive before processing it and removes the object after completion', async () => {
    const s3Job = {
      ...queuedJob,
      archivePath: 'user-1/migrations/migration-1/archive.zip',
    };
    prisma.activityMigrationJob.findFirst.mockResolvedValueOnce(s3Job);
    parseCsvFileIntoArray.mockResolvedValueOnce([{ 'Activity ID': 'strava-1' }]);

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(storage.downloadObjectToFile).toHaveBeenCalledWith(
      s3Job.archivePath,
      expect.stringMatching(/runich-activity-migrations\/.*\.zip$/),
      'Файл архива миграции не найден',
    );
    expect(storage.deleteObjectByKey).toHaveBeenCalledWith(s3Job.archivePath);
  });

  it("returns only the authenticated user's job", async () => {
    await expect(service.getJobForUser(queuedJob.id, 'user-1')).resolves.toMatchObject({
      jobId: queuedJob.id,
      status: 'queued',
    });
    expect(prisma.activityMigrationJob.findFirst).toHaveBeenCalledWith({
      where: { id: queuedJob.id, userId: 'user-1' },
    });

    prisma.activityMigrationJob.findFirst.mockResolvedValueOnce(null);
    await expect(service.getJobForUser(queuedJob.id, 'other-user')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restores the latest active migration for the authenticated user', async () => {
    const processingJob = { ...queuedJob, status: 'processing' };
    prisma.activityMigrationJob.findFirst.mockResolvedValueOnce(processingJob);

    await expect(service.getCurrentJobForUser('user-1')).resolves.toMatchObject({
      jobId: queuedJob.id,
      status: 'processing',
    });
    expect(prisma.activityMigrationJob.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: { in: ['uploading', 'queued', 'processing'] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('returns no current migration when the user has no active job', async () => {
    prisma.activityMigrationJob.findFirst.mockResolvedValueOnce(null);

    await expect(service.getCurrentJobForUser('user-1')).resolves.toBeNull();
  });

  it('handles Prisma timestamp strings while checking stale uploads', async () => {
    const uploadJob = {
      ...queuedJob,
      status: 'uploading',
      uploadUpdatedAt: new Date().toISOString(),
    };
    prisma.activityMigrationJob.findFirst.mockResolvedValueOnce(uploadJob);

    await expect(service.getJobForUser(uploadJob.id, uploadJob.userId)).resolves.toMatchObject({
      jobId: uploadJob.id,
      status: 'uploading',
    });
  });

  it('reports the current job position without exposing other users', async () => {
    prisma.activityMigrationJob.findFirst.mockResolvedValueOnce({
      ...queuedJob,
      createdAt: new Date('2026-09-07T00:03:00.000Z'),
    });
    migrationJobCount.mockResolvedValueOnce(1).mockResolvedValueOnce(3).mockResolvedValueOnce(2);

    await expect(service.getJobForUser(queuedJob.id, 'user-1')).resolves.toMatchObject({
      queuePosition: 4,
      queueAhead: 3,
      queueSize: 4,
    });
    expect(migrationJobCount).toHaveBeenNthCalledWith(3, {
      where: {
        status: 'queued',
        OR: [
          { createdAt: { lt: new Date('2026-09-07T00:03:00.000Z') } },
          { createdAt: new Date('2026-09-07T00:03:00.000Z'), id: { lt: queuedJob.id } },
        ],
      },
    });
  });

  it('persists each mapped batch together with its progress', async () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({ 'Activity ID': `strava-${index + 1}` }));
    parseCsvFileIntoArray.mockResolvedValue(rows);
    createActivitiesFromMigrationArchive
      .mockResolvedValueOnce({ success: true, importedActivities: 8 })
      .mockResolvedValueOnce({ success: true, importedActivities: 1 });

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(mapActivitiesWithCoordinates).toHaveBeenCalledTimes(2);
    expect(createActivitiesFromMigrationArchive).toHaveBeenCalledTimes(2);
    expect(createActivitiesFromMigrationArchive).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      expect.objectContaining({ activity: {}, activityMigrationJob: expect.any(Object) }),
    );
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transactionJobUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: queuedJob.id },
      data: { processedActivities: 8, importedActivities: 8, skippedActivities: 0 },
    });
    expect(transactionJobUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: queuedJob.id },
      data: { processedActivities: 9, importedActivities: 9, skippedActivities: 0 },
    });
    expect(prisma.activityMigrationJob.update).toHaveBeenLastCalledWith({
      where: { id: queuedJob.id },
      data: expect.objectContaining({
        status: 'completed',
        processedActivities: 9,
        importedActivities: 9,
        skippedActivities: 0,
      }),
    });
    expect(rm).toHaveBeenCalledWith(queuedJob.archivePath, { force: true });
  });

  it('resumes from the last transactionally committed CSV row', async () => {
    prisma.activityMigrationJob.findFirst.mockResolvedValueOnce({
      ...queuedJob,
      totalActivities: 3,
      processedActivities: 2,
      importedActivities: 1,
      skippedActivities: 1,
    });
    parseCsvFileIntoArray.mockResolvedValue([
      { 'Activity ID': 'strava-1' },
      { 'Activity ID': 'strava-2' },
      { 'Activity ID': 'strava-3' },
    ]);
    createActivitiesFromMigrationArchive.mockResolvedValue({ success: true, importedActivities: 1 });

    await service.processNextJob();

    expect(mapActivitiesWithCoordinates).toHaveBeenCalledTimes(1);
    expect(mapActivitiesWithCoordinates).toHaveBeenCalledWith(
      expect.objectContaining({ parsedActivities: [{ 'Activity ID': 'strava-3' }] }),
    );
    expect(transactionJobUpdate).toHaveBeenCalledWith({
      where: { id: queuedJob.id },
      data: { processedActivities: 3, importedActivities: 2, skippedActivities: 1 },
    });
  });

  it('marks processing failures and removes unusable temporary files', async () => {
    parseCsvFileIntoArray.mockRejectedValueOnce(new Error('csv failed'));

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(prisma.activityMigrationJob.update).toHaveBeenCalledWith({
      where: { id: queuedJob.id },
      data: expect.objectContaining({ status: 'failed', errorMessage: 'csv failed' }),
    });
    expect(rm).toHaveBeenCalledWith(queuedJob.archivePath, { force: true });
  });

  it('keeps the archive and requeues the job when shutdown is requested', async () => {
    parseCsvFileIntoArray.mockResolvedValue([{ 'Activity ID': 'strava-1' }]);
    service.requestStop();

    await service.processNextJob();

    expect(prisma.activityMigrationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: queuedJob.id, status: 'processing' },
      data: { status: 'queued', startedAt: null },
    });
    expect(createActivitiesFromMigrationArchive).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
  });

  it('recovers interrupted jobs before starting the polling loop', async () => {
    prisma.activityMigrationJob.findMany.mockResolvedValueOnce([{ ...queuedJob, status: 'processing' }]);
    const processNextJob = jest.spyOn(service, 'processNextJob').mockImplementation(async () => {
      service.requestStop();
      return true;
    });

    await service.runWorker();

    expect(prisma.activityMigrationJob.update).toHaveBeenCalledWith({
      where: { id: queuedJob.id },
      data: { status: 'queued', startedAt: null, finishedAt: null, errorMessage: null },
    });
    expect(processNextJob).toHaveBeenCalledTimes(1);
  });

  it('returns false when the durable queue is empty', async () => {
    prisma.activityMigrationJob.findFirst.mockResolvedValueOnce(null);
    await expect(service.processNextJob()).resolves.toBe(false);
    expect(prisma.activityMigrationJob.updateMany).not.toHaveBeenCalled();
  });

  it('does not process a job claimed by another worker', async () => {
    prisma.activityMigrationJob.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(unzipTransferArchive).not.toHaveBeenCalled();
    expect(parseCsvFileIntoArray).not.toHaveBeenCalled();
  });

  it('marks an interrupted job failed when its archive is missing', async () => {
    prisma.activityMigrationJob.findMany.mockResolvedValueOnce([{ ...queuedJob, status: 'processing' }]);
    access.mockRejectedValueOnce(new Error('archive missing'));
    const processNextJob = jest.spyOn(service, 'processNextJob').mockImplementation(async () => {
      service.requestStop();
      return true;
    });

    await service.runWorker();

    expect(prisma.activityMigrationJob.update).toHaveBeenCalledWith({
      where: { id: queuedJob.id },
      data: expect.objectContaining({
        status: 'failed',
        errorMessage: 'Файл архива миграции не найден после перезапуска worker',
      }),
    });
    expect(processNextJob).toHaveBeenCalledTimes(1);
  });

  it('marks a claimed job failed when its archive disappears before processing', async () => {
    access.mockRejectedValueOnce(new Error('archive missing'));

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(prisma.activityMigrationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', errorMessage: 'Файл архива миграции не найден' }),
      }),
    );
  });

  it('rejects a job whose saved progress is beyond the current CSV', async () => {
    prisma.activityMigrationJob.findFirst.mockResolvedValueOnce({ ...queuedJob, processedActivities: 2 });
    parseCsvFileIntoArray.mockResolvedValueOnce([{ 'Activity ID': 'strava-1' }]);

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(prisma.activityMigrationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          errorMessage: 'Сохранённый прогресс миграции превышает количество активностей в архиве',
        }),
      }),
    );
  });

  it('records skipped rows when the mapper returns an empty batch', async () => {
    parseCsvFileIntoArray.mockResolvedValueOnce([{ 'Activity ID': 'strava-skipped' }]);
    mapActivitiesWithCoordinates.mockResolvedValueOnce([]);

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(createActivitiesFromMigrationArchive).not.toHaveBeenCalled();
    expect(transactionJobUpdate).toHaveBeenCalledWith({
      where: { id: queuedJob.id },
      data: { processedActivities: 1, importedActivities: 0, skippedActivities: 1 },
    });
  });

  it('keeps the archive when saving a failure status also fails', async () => {
    parseCsvFileIntoArray.mockRejectedValueOnce('csv failed');
    prisma.activityMigrationJob.update.mockRejectedValueOnce('status unavailable');

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(rm).not.toHaveBeenCalled();
  });

  it('reports cleanup failures after a processed job', async () => {
    parseCsvFileIntoArray.mockRejectedValueOnce(new Error('csv failed'));
    rm.mockRejectedValueOnce(new Error('archive cleanup failed'));

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(rm).toHaveBeenCalledTimes(2);
  });

  it('requeues a job when shutdown is requested after persisting its batch', async () => {
    parseCsvFileIntoArray.mockResolvedValueOnce([{ 'Activity ID': 'strava-1' }]);
    mapActivitiesWithCoordinates.mockImplementationOnce(async () => {
      service.requestStop();
      return [mappedActivity('strava-1')];
    });

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(prisma.activityMigrationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: queuedJob.id, status: 'processing' },
      data: { status: 'queued', startedAt: null },
    });
    expect(rm).not.toHaveBeenCalled();
  });
});
