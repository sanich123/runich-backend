import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { asyncMock } from 'src/__tests__/helpers';

const mkdir = asyncMock();
const rm = asyncMock();
const access = asyncMock();
const readFile = asyncMock();
const stat = asyncMock();
const rename = asyncMock();
const writeFile = asyncMock();
const mkdtemp = asyncMock();
const copyFile = asyncMock();
const readdir = asyncMock();
const open = asyncMock();
const unlink = asyncMock();
const lstat = asyncMock();
const realpath = asyncMock();
const readlink = asyncMock();
const symlink = asyncMock();
const link = asyncMock();
const chmod = asyncMock();
const chown = asyncMock();
const utimes = asyncMock();
const truncate = asyncMock();

jest.unstable_mockModule('fs/promises', () => ({
  access,
  chmod,
  chown,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  realpath,
  stat,
  symlink,
  truncate,
  unlink,
  utimes,
  writeFile,
}));

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

  it('queues the archive and returns before processing starts', async () => {
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

  it('returns the migration status only for the authenticated user', async () => {
    await expect(
      controller.getStravaMigrationStatus({ jobId: 'job-1' }, { user: { id: 'user-1' } } as never),
    ).resolves.toEqual(expect.objectContaining({ jobId: 'job-1', status: 'processing' }));
    expect(activityMigrationService.getJobForUser).toHaveBeenCalledWith('job-1', 'user-1');
  });

  it('rejects migration requests without an archive or account and removes an unqueued upload', async () => {
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
