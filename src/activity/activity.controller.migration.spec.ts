import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { asyncMock } from 'src/__tests__/helpers';

const unzipTransferArchive = asyncMock();
const parseCsvFileIntoArray = asyncMock();
const mapActivitiesWithCoordinates = asyncMock();
const rm = asyncMock();

jest.unstable_mockModule('fs/promises', () => ({ mkdir: asyncMock(), rm }));
jest.unstable_mockModule('src/common/parsers/unzip-archive', () => ({ unzipTransferArchive }));
jest.unstable_mockModule('src/common/parsers/parse-csv', () => ({ parseCsvFileIntoArray }));
jest.unstable_mockModule('src/common/parsers/map-activities-with-coordinates', () => ({
  mapActivitiesWithCoordinates,
}));

const { ActivityController } = await import('./activity.controller');
import { ActivityService } from './activity.service';
import { AccountService } from 'src/account/account.service';

describe('ActivityController Strava migration', () => {
  const activityService = { createActivitiesFromMigrationArchive: asyncMock() };
  const accountService = { getOrCreateAccountByUserId: asyncMock() };
  const controller = new ActivityController(
    activityService as unknown as ActivityService,
    accountService as unknown as AccountService,
  );
  const file = { path: '/tmp/runich-strava-archive.zip' } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    accountService.getOrCreateAccountByUserId.mockResolvedValue({ id: 'profile-1' });
    unzipTransferArchive.mockResolvedValue(undefined);
    parseCsvFileIntoArray.mockResolvedValue([{ 'Activity ID': 'strava-1' }]);
    mapActivitiesWithCoordinates.mockResolvedValue([{ id: 'activity-1', sourceActivityId: 'strava-1' }]);
    activityService.createActivitiesFromMigrationArchive.mockResolvedValue({ success: true });
    rm.mockResolvedValue(undefined);
  });

  it('unpacks, parses, maps and persists a migration archive', async () => {
    await expect(controller.getArchiveWithActivitiesFromStrava(file, { id: 'user-1' })).resolves.toEqual({
      success: true,
    });
    expect(unzipTransferArchive).toHaveBeenCalledWith(file.path);
    expect(parseCsvFileIntoArray).toHaveBeenCalledTimes(1);
    expect(mapActivitiesWithCoordinates).toHaveBeenCalledWith({
      parsedActivities: [{ 'Activity ID': 'strava-1' }],
      userId: 'user-1',
      profileId: 'profile-1',
    });
    expect(activityService.createActivitiesFromMigrationArchive).toHaveBeenCalledWith([
      { id: 'activity-1', sourceActivityId: 'strava-1' },
    ]);
  });

  it('returns undefined when mapping yields no result and propagates each migration failure', async () => {
    mapActivitiesWithCoordinates.mockResolvedValueOnce(undefined);
    await expect(controller.getArchiveWithActivitiesFromStrava(file, { id: 'user-1' })).resolves.toBeUndefined();
    expect(activityService.createActivitiesFromMigrationArchive).not.toHaveBeenCalled();

    unzipTransferArchive.mockRejectedValueOnce(new Error('unzip failed'));
    await expect(controller.getArchiveWithActivitiesFromStrava(file, { id: 'user-1' })).rejects.toThrow('unzip failed');

    parseCsvFileIntoArray.mockRejectedValueOnce(new Error('csv failed'));
    await expect(controller.getArchiveWithActivitiesFromStrava(file, { id: 'user-1' })).rejects.toThrow('csv failed');

    mapActivitiesWithCoordinates.mockRejectedValueOnce(new Error('mapping failed'));
    await expect(controller.getArchiveWithActivitiesFromStrava(file, { id: 'user-1' })).rejects.toThrow(
      'mapping failed',
    );

    activityService.createActivitiesFromMigrationArchive.mockRejectedValueOnce(new Error('write failed'));
    await expect(controller.getArchiveWithActivitiesFromStrava(file, { id: 'user-1' })).rejects.toThrow('write failed');
  });

  it('logs cleanup failures while preserving the migration result', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    rm.mockRejectedValueOnce(new Error('cleanup failed')).mockResolvedValue(undefined);

    await expect(controller.getArchiveWithActivitiesFromStrava(file, { id: 'user-1' })).resolves.toEqual({
      success: true,
    });
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to clean up migration files',
      expect.stringContaining('cleanup failed'),
    );
    loggerError.mockRestore();
  });
});
