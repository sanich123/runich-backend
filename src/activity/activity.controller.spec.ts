import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { AccountService } from 'src/account/account.service';
import { asyncMock } from 'src/__tests__/helpers';
import { ActivityMigrationService } from './activity-migration.service';

describe('ActivityController', () => {
  const activityService = {
    getMediaByUserId: asyncMock(),
    getLocationsByActivityId: asyncMock(),
    getActivitiesByTheirIds: asyncMock(),
    createActivitiesFromMigrationArchive: asyncMock(),
    createActivity: asyncMock(),
    updateActivity: asyncMock(),
    getActivitesByUserId: asyncMock(),
    getAllActivitiesWithFriends: asyncMock(),
    getActivityByActivityId: asyncMock(),
    deleteActivityById: asyncMock(),
  };
  const accountService = { getOrCreateAccountByUserId: asyncMock() };
  const activityMigrationService = { enqueue: asyncMock(), getJobForUser: asyncMock() };
  const controller = new ActivityController(
    activityService as unknown as ActivityService,
    accountService as unknown as AccountService,
    activityMigrationService as unknown as ActivityMigrationService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for all non-migration activity endpoints', async () => {
    const result = { id: 'activity-1' };
    activityService.getMediaByUserId.mockResolvedValue({ photos: [] });
    activityService.getLocationsByActivityId.mockResolvedValue({ locations: [] });
    activityService.getActivitiesByTheirIds.mockResolvedValue([result]);
    activityService.createActivity.mockResolvedValue(result);
    activityService.updateActivity.mockResolvedValue(result);
    activityService.getActivitesByUserId.mockResolvedValue({ activities: [result], isLastPage: false });
    activityService.getAllActivitiesWithFriends.mockResolvedValue({ activities: [result], isLastPage: false });
    activityService.getActivityByActivityId.mockResolvedValue(result);
    activityService.deleteActivityById.mockResolvedValue(result);

    await expect(controller.getMediaByUserId({ id: 'u1' }, '10')).resolves.toEqual({ photos: [] });
    await expect(controller.getLocationsByActivityId({ id: 'a1' })).resolves.toEqual({ locations: [] });
    await expect(controller.getActivitiesByActivitiesIds('a1,a2')).resolves.toEqual([result]);
    await expect(controller.getActivitiesByActivitiesIds(['a1', 'a2'])).resolves.toEqual([result]);
    expect(activityService.getActivitiesByTheirIds).toHaveBeenLastCalledWith(['a1', 'a2']);
    await expect(
      controller.createActivity({ duration: 1, distance: 2, speed: 3, sport: 'run' }, { id: 'u1' }),
    ).resolves.toEqual(result);
    await expect(
      controller.patchActivity({ duration: 1, distance: 2, speed: 3, sport: 'run' }, { id: 'a1' }),
    ).resolves.toEqual(result);
    await expect(controller.getActivitiesByUserId({ id: 'u1' }, '1', '10')).resolves.toEqual({
      activities: [result],
      isLastPage: false,
    });
    await expect(controller.getAllActivitiesWithFriends({ id: 'u1' }, '1', '10')).resolves.toEqual({
      activities: [result],
      isLastPage: false,
    });
    await expect(controller.getActivityByActivityId({ id: 'a1' })).resolves.toEqual(result);
    await expect(controller.deleteActivityById({ id: 'a1' })).resolves.toEqual(result);
  });

  it('rejects migration requests without an archive or account', async () => {
    await expect(controller.getArchiveWithActivitiesFromStrava(undefined, { id: 'u1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    accountService.getOrCreateAccountByUserId.mockResolvedValue(null);
    await expect(
      controller.getArchiveWithActivitiesFromStrava({ path: '/tmp/archive.zip' } as Express.Multer.File, { id: 'u1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects activity id queries that are missing despite the required API contract', async () => {
    await expect(controller.getActivitiesByActivitiesIds(undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getActivitiesByActivitiesIds('')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getActivitiesByActivitiesIds('   ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getActivitiesByActivitiesIds([])).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getActivitiesByActivitiesIds(['a1', '   '])).rejects.toBeInstanceOf(BadRequestException);
    expect(activityService.getActivitiesByTheirIds).not.toHaveBeenCalled();
  });

  it('rejects malformed pagination queries before calling the activity service', async () => {
    await expect(controller.getMediaByUserId({ id: 'u1' }, 'not-a-number')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getActivitiesByUserId({ id: 'u1' }, '-1', '10')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.getActivitiesByUserId({ id: 'u1' }, '0', '0')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getAllActivitiesWithFriends({ id: 'u1' }, '1.5', '10')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('propagates service errors from every non-migration endpoint', async () => {
    const error = new Error('service failed');
    Object.values(activityService).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.getMediaByUserId({ id: 'u1' }, '10')).rejects.toBe(error);
    await expect(controller.getLocationsByActivityId({ id: 'a1' })).rejects.toBe(error);
    await expect(controller.getActivitiesByActivitiesIds('a1')).rejects.toBe(error);
    await expect(
      controller.createActivity({ duration: 1, distance: 2, speed: 3, sport: 'run' }, { id: 'u1' }),
    ).rejects.toBe(error);
    await expect(
      controller.patchActivity({ duration: 1, distance: 2, speed: 3, sport: 'run' }, { id: 'a1' }),
    ).rejects.toBe(error);
    await expect(controller.getActivitiesByUserId({ id: 'u1' }, '0', '10')).rejects.toBe(error);
    await expect(controller.getAllActivitiesWithFriends({ id: 'u1' }, '0', '10')).rejects.toBe(error);
    await expect(controller.getActivityByActivityId({ id: 'a1' })).rejects.toBe(error);
    await expect(controller.deleteActivityById({ id: 'a1' })).rejects.toBe(error);
  });
});
