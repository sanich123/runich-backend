import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { asyncMock } from 'src/__tests__/helpers';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

type MapInput = {
  parsedActivities?: Record<string, unknown>[];
  userId: string;
  profileId: string;
  migrationDirectory?: string;
};

type MigratedActivity = {
  id: string;
  user_id: string;
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
const rm = asyncMock();
const unzipTransferArchive = asyncMock();
const parseCsvFileIntoArray = asyncMock();
const mapActivitiesWithCoordinates = jest.fn<(input: MapInput) => Promise<MigratedActivity[]>>();
const createMany = jest.fn<(input: unknown) => Promise<{ count: number }>>();
const transactionJobUpdate = jest.fn<(input: unknown) => Promise<unknown>>();
type TransactionClient = {
  activity: { createMany: typeof createMany };
  activityMigrationJob: { update: typeof transactionJobUpdate };
};
const transaction = jest.fn<(callback: (client: TransactionClient) => Promise<unknown>) => Promise<unknown>>();

jest.unstable_mockModule('node:fs/promises', () => ({ access, rm }));
jest.unstable_mockModule('src/common/parsers/unzip-archive', () => ({ unzipTransferArchive }));
jest.unstable_mockModule('src/common/parsers/parse-csv', () => ({ parseCsvFileIntoArray }));
jest.unstable_mockModule('src/common/parsers/map-activities-with-coordinates', () => ({
  mapActivitiesWithCoordinates,
}));

const { ActivityMigrationService } = await import('./activity-migration.service');

const prisma = {
  activityMigrationJob: {
    create: asyncMock(),
    findFirst: asyncMock(),
    findMany: asyncMock(),
    update: asyncMock(),
    updateMany: asyncMock(),
  },
  $transaction: transaction,
};

const queuedJob = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: 'user-1',
  profileId: 'profile-1',
  archivePath: '/tmp/archive.zip',
  status: 'queued',
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
    user_id: 'user-1',
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
      { index: 0, param: PrismaService },
    ]);
  });

  it('uses a ten-second polling interval by default', () => {
    delete process.env.MIGRATION_WORKER_POLL_INTERVAL_MS;
    const serviceWithDefaults = new ActivityMigrationService(prisma as unknown as PrismaService);

    expect(serviceWithDefaults['pollIntervalMs']).toBe(10_000);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MIGRATION_ACTIVITY_BATCH_SIZE = '2';
    process.env.MIGRATION_BATCH_PAUSE_MS = '0';
    process.env.MIGRATION_WORKER_POLL_INTERVAL_MS = '100';
    service = new ActivityMigrationService(prisma as unknown as PrismaService);

    access.mockResolvedValue(undefined);
    rm.mockResolvedValue(undefined);
    unzipTransferArchive.mockResolvedValue({ compressedBytes: 100, uncompressedBytes: 200, entries: 4 });
    prisma.activityMigrationJob.create.mockResolvedValue(queuedJob);
    prisma.activityMigrationJob.findFirst.mockResolvedValue(queuedJob);
    prisma.activityMigrationJob.findMany.mockResolvedValue([]);
    prisma.activityMigrationJob.update.mockResolvedValue(queuedJob);
    prisma.activityMigrationJob.updateMany.mockResolvedValue({ count: 1 });
    transactionJobUpdate.mockResolvedValue(queuedJob);
    transaction.mockImplementation(async (callback) =>
      callback({ activity: { createMany }, activityMigrationJob: { update: transactionJobUpdate } }),
    );
    mapActivitiesWithCoordinates.mockImplementation(async ({ parsedActivities = [] }) =>
      parsedActivities.map((activity) => mappedActivity(String(activity['Activity ID']))),
    );
  });

  afterAll(() => {
    delete process.env.MIGRATION_ACTIVITY_BATCH_SIZE;
    delete process.env.MIGRATION_BATCH_PAUSE_MS;
    delete process.env.MIGRATION_WORKER_POLL_INTERVAL_MS;
  });

  it('creates a durable queued job without starting work in the API process', async () => {
    await expect(
      service.enqueue({ userId: 'user-1', profileId: 'profile-1', archivePath: '/tmp/archive.zip' }),
    ).resolves.toMatchObject({ jobId: queuedJob.id, status: 'queued' });

    expect(prisma.activityMigrationJob.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        profileId: 'profile-1',
        archivePath: '/tmp/archive.zip',
        status: 'queued',
      },
    });
    expect(prisma.activityMigrationJob.findFirst).not.toHaveBeenCalled();
    expect(unzipTransferArchive).not.toHaveBeenCalled();
  });

  it("returns only the authenticated user's job", async () => {
    await expect(service.getJobForUser(queuedJob.id, 'user-1')).resolves.toMatchObject({
      jobId: queuedJob.id,
      status: 'queued',
    });
    expect(prisma.activityMigrationJob.findFirst).toHaveBeenCalledWith({
      where: { id: queuedJob.id, user_id: 'user-1' },
    });

    prisma.activityMigrationJob.findFirst.mockResolvedValueOnce(null);
    await expect(service.getJobForUser(queuedJob.id, 'other-user')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persists each mapped batch together with its progress', async () => {
    const rows = [{ 'Activity ID': 'strava-1' }, { 'Activity ID': 'strava-2' }, { 'Activity ID': 'strava-3' }];
    parseCsvFileIntoArray.mockResolvedValue(rows);
    createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });

    await expect(service.processNextJob()).resolves.toBe(true);

    expect(mapActivitiesWithCoordinates).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transactionJobUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: queuedJob.id },
      data: { processedActivities: 2, importedActivities: 1, skippedActivities: 1 },
    });
    expect(transactionJobUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: queuedJob.id },
      data: { processedActivities: 3, importedActivities: 2, skippedActivities: 1 },
    });
    expect(prisma.activityMigrationJob.update).toHaveBeenLastCalledWith({
      where: { id: queuedJob.id },
      data: expect.objectContaining({
        status: 'completed',
        processedActivities: 3,
        importedActivities: 2,
        skippedActivities: 1,
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
    createMany.mockResolvedValue({ count: 1 });

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
    expect(createMany).not.toHaveBeenCalled();
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
});
