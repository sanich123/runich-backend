import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { asyncMock } from 'src/__tests__/helpers';

const mkdir = asyncMock();
const rm = asyncMock();
const stat = asyncMock();
jest.unstable_mockModule('fs/promises', () => ({ access: asyncMock(), mkdir, readFile: asyncMock(), rm, stat }));

const { ActivityController } = await import('./activity.controller');
import { ActivityService } from './activity.service';
import { ActivityMigrationService } from './activity-migration.service';
import { AccountService } from 'src/account/account.service';

describe('ActivityController Strava migration', () => {
  const activityService = {} as ActivityService;
  const accountService = { getOrCreateAccountByUserId: asyncMock() };
  const activityMigrationService = {
    enqueue: asyncMock(),
    getJobForUser: asyncMock(),
  };
  const controller = new ActivityController(
    activityService,
    accountService as unknown as AccountService,
    activityMigrationService as unknown as ActivityMigrationService,
  );
  const file = { path: '/tmp/runich-strava-archive.zip' } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    accountService.getOrCreateAccountByUserId.mockResolvedValue({ id: 'profile-1' });
    activityMigrationService.enqueue.mockResolvedValue({
      jobId: 'job-1',
      status: 'queued',
      totalActivities: 0,
      processedActivities: 0,
      importedActivities: 0,
      skippedActivities: 0,
      errorMessage: null,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
    });
    activityMigrationService.getJobForUser.mockResolvedValue({ jobId: 'job-1', status: 'processing' });
    rm.mockResolvedValue(undefined);
  });

  it('queues the archive and returns a job status instead of processing it in the request', async () => {
    await expect(controller.getArchiveWithActivitiesFromStrava(file, { id: 'user-1' })).resolves.toMatchObject({
      jobId: 'job-1',
      status: 'queued',
    });
    expect(activityMigrationService.enqueue).toHaveBeenCalledWith({
      archivePath: file.path,
      userId: 'user-1',
      profileId: 'profile-1',
    });
    expect(rm).not.toHaveBeenCalled();
  });

  it('returns the migration job status for the authenticated user', async () => {
    await expect(
      controller.getStravaMigrationStatus({ jobId: 'job-1' }, { user: { id: 'user-1' } } as never),
    ).resolves.toEqual(expect.objectContaining({ jobId: 'job-1', status: 'processing' }));
    expect(activityMigrationService.getJobForUser).toHaveBeenCalledWith('job-1', 'user-1');
  });

  it('rejects migration requests without an archive or account', async () => {
    await expect(controller.getArchiveWithActivitiesFromStrava(undefined, { id: 'u1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    accountService.getOrCreateAccountByUserId.mockResolvedValue(null);
    await expect(controller.getArchiveWithActivitiesFromStrava(file, { id: 'u1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(rm).toHaveBeenCalledWith(file.path, { force: true });
  });
});
