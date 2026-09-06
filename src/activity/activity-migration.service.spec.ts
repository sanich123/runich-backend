import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { asyncMock } from 'src/__tests__/helpers';
import { ActivityService } from './activity.service';
import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

const prisma = {
  activityMigrationJob: {
    create: asyncMock(),
    findFirst: asyncMock(),
    findMany: asyncMock(),
    update: asyncMock(),
    updateMany: asyncMock(),
    findUnique: asyncMock(),
  },
};

const activityService = {} as ActivityService;

const setImmediateSpy = jest.spyOn(global, 'setImmediate').mockImplementation(() => 0 as never);
const { ActivityMigrationService } = await import('./activity-migration.service');

describe('ActivityMigrationService', () => {
  let service: InstanceType<typeof ActivityMigrationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ActivityMigrationService(prisma as unknown as PrismaService, activityService);
    prisma.activityMigrationJob.create.mockResolvedValue({
      id: 'job-1',
      status: 'queued',
      totalActivities: 0,
      processedActivities: 0,
      importedActivities: 0,
      skippedActivities: 0,
      errorMessage: null,
      createdAt: new Date('2026-09-06T00:00:00.000Z'),
      startedAt: null,
      finishedAt: null,
    });
    prisma.activityMigrationJob.findFirst.mockResolvedValue({
      id: 'job-1',
      status: 'processing',
      totalActivities: 10,
      processedActivities: 4,
      importedActivities: 4,
      skippedActivities: 0,
      errorMessage: null,
      createdAt: new Date('2026-09-06T00:00:00.000Z'),
      startedAt: new Date('2026-09-06T00:01:00.000Z'),
      finishedAt: null,
    });
  });

  afterAll(() => setImmediateSpy.mockRestore());

  it('creates a queued job and schedules it after the upload request', async () => {
    await expect(
      service.enqueue({ userId: 'user-1', profileId: 'profile-1', archivePath: '/tmp/archive.zip' }),
    ).resolves.toMatchObject({ jobId: 'job-1', status: 'queued' });

    expect(prisma.activityMigrationJob.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        profileId: 'profile-1',
        archivePath: '/tmp/archive.zip',
        status: 'queued',
      },
    });
    expect(setImmediateSpy).toHaveBeenCalledTimes(1);
  });

  it("returns only the requested user's job", async () => {
    await expect(service.getJobForUser('job-1', 'user-1')).resolves.toMatchObject({
      jobId: 'job-1',
      status: 'processing',
      processedActivities: 4,
    });
    expect(prisma.activityMigrationJob.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', user_id: 'user-1' },
    });
  });

  it("does not expose another user's job", async () => {
    prisma.activityMigrationJob.findFirst.mockResolvedValue(null);
    await expect(service.getJobForUser('job-1', 'other-user')).rejects.toBeInstanceOf(NotFoundException);
  });
});
