import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { encodeActivityCursor } from '../activity.pagination';
import { ActivityController } from '../activity.controller';
import { ActivityService } from '../services/activity.service';
import { AccountService } from 'src/account/account.service';
import { asyncMock } from 'src/tests/helpers';
import { ActivityMigrationService } from '../services/activity-migration.service';

describe('ActivityController', () => {
  const activityIds = ['51f499f2-3332-4fdb-ac78-cb6ab1e6106a', '4755835b-8591-4cf2-ac17-3a2785706f16'];
  const activityService = {
    getMediaByUserId: asyncMock(),
    deleteActivityMedia: asyncMock(),
    getLocationsByActivityId: asyncMock(),
    getActivitiesByTheirIds: asyncMock(),
    createActivitiesFromMigrationArchive: asyncMock(),
    createActivity: asyncMock(),
    updateActivity: asyncMock(),
    getActivitesByUserId: asyncMock(),
    getAllActivitiesWithFriends: asyncMock(),
    getFavoriteActivities: asyncMock(),
    setActivityFavorite: asyncMock(),
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
    activityService.getMediaByUserId.mockResolvedValue({ media: [] });
    activityService.deleteActivityMedia.mockResolvedValue({ success: true });
    activityService.getLocationsByActivityId.mockResolvedValue({ locations: [] });
    activityService.getActivitiesByTheirIds.mockResolvedValue([result]);
    activityService.createActivity.mockResolvedValue(result);
    activityService.updateActivity.mockResolvedValue(result);
    activityService.getActivitesByUserId.mockResolvedValue({ activities: [result], hasMore: false, nextCursor: null });
    activityService.getAllActivitiesWithFriends.mockResolvedValue({
      activities: [result],
      hasMore: false,
      nextCursor: null,
    });
    activityService.getActivityByActivityId.mockResolvedValue(result);
    activityService.deleteActivityById.mockResolvedValue(result);

    const request = { user: { id: 'u1' } } as never;
    await expect(controller.getMediaByUserId({ id: 'u1' }, undefined, '10', request)).resolves.toEqual({ media: [] });
    expect(activityService.getMediaByUserId).toHaveBeenCalledWith('u1', '10', undefined, 'u1');
    await expect(controller.deleteActivityMedia({ id: 'a1', mediaId: 'm1' }, request)).resolves.toBeUndefined();
    expect(activityService.deleteActivityMedia).toHaveBeenCalledWith('a1', 'm1', 'u1');
    await expect(controller.getLocationsByActivityId({ id: 'a1' }, request)).resolves.toEqual({ locations: [] });
    await expect(controller.getActivitiesByActivitiesIds(activityIds.join(','))).resolves.toEqual([result]);
    await expect(controller.getActivitiesByActivitiesIds(activityIds)).resolves.toEqual([result]);
    expect(activityService.getActivitiesByTheirIds).toHaveBeenLastCalledWith(activityIds, undefined);
    await expect(
      controller.createActivity({ duration: 1, distance: 2, speed: 3, sport: 'run' }, { id: 'u1' }),
    ).resolves.toEqual(result);
    await expect(
      controller.patchActivity({ duration: 1, distance: 2, speed: 3, sport: 'run' }, { id: 'a1' }),
    ).resolves.toEqual(result);
    await expect(controller.getActivitiesByUserId({ id: 'u1' }, undefined, '10')).resolves.toEqual({
      activities: [result],
      hasMore: false,
      nextCursor: null,
    });
    await expect(controller.getAllActivitiesWithFriends({ id: 'u1' }, undefined, '10')).resolves.toEqual({
      activities: [result],
      hasMore: false,
      nextCursor: null,
    });
    await expect(controller.getActivityByActivityId({ id: 'a1' }, request)).resolves.toEqual(result);
    await expect(controller.deleteActivityById({ id: 'a1' })).resolves.toEqual(result);
  });

  it('passes authenticated user and cursor pagination to the favorites service', async () => {
    const date = new Date('2026-08-12T23:15:00.000Z');
    const cursor = encodeActivityCursor({ date, id: 'activity-cursor' });
    const page = { activities: [], hasMore: false, nextCursor: null };
    activityService.getFavoriteActivities.mockResolvedValue(page);

    await expect(controller.getFavoriteActivities({ user: { id: 'user-1' } } as never, cursor, '7')).resolves.toEqual(
      page,
    );
    expect(activityService.getFavoriteActivities).toHaveBeenCalledWith('user-1', '7', {
      date,
      id: 'activity-cursor',
    });

    await expect(
      controller.getFavoriteActivities({ user: { id: 'user-1' } } as never, undefined, '0'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.getFavoriteActivities({ user: { id: 'user-1' } } as never, 'invalid-cursor', '7'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(activityService.getFavoriteActivities).toHaveBeenCalledTimes(1);
  });

  it('updates favorite state for the authenticated activity owner', async () => {
    const result = { id: 'activity-1', isFavorite: true };
    activityService.setActivityFavorite.mockResolvedValue(result);

    await expect(
      controller.setActivityFavorite({ isFavorite: true }, { id: 'activity-1' }, { user: { id: 'owner-1' } } as never),
    ).resolves.toEqual(result);
    expect(activityService.setActivityFavorite).toHaveBeenCalledWith('activity-1', 'owner-1', true);
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
    await expect(controller.getActivitiesByActivitiesIds([activityIds[0], '   '])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.getActivitiesByActivitiesIds('not-an-activity-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(activityService.getActivitiesByTheirIds).not.toHaveBeenCalled();
  });

  it('normalizes legacy activity ids encoded as a route segment', async () => {
    activityService.getActivitiesByTheirIds.mockResolvedValue([]);

    await expect(
      controller.getActivitiesByActivitiesIds(`ids=${activityIds[0]}&ids=${activityIds[1]}`),
    ).resolves.toEqual([]);
    expect(activityService.getActivitiesByTheirIds).toHaveBeenCalledWith(activityIds, undefined);
  });

  it('rejects malformed pagination queries before calling the activity service', async () => {
    await expect(controller.getMediaByUserId({ id: 'u1' }, undefined, 'not-a-number')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.getActivitiesByUserId({ id: 'u1' }, '-1', '10')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.getActivitiesByUserId({ id: 'u1' }, undefined, '0')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.getAllActivitiesWithFriends({ id: 'u1' }, '1.5', '10')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('propagates service errors from every non-migration endpoint', async () => {
    const error = new Error('service failed');
    const request = { user: { id: 'u1' } } as never;
    Object.values(activityService).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.getMediaByUserId({ id: 'u1' }, undefined, '10')).rejects.toBe(error);
    await expect(
      controller.deleteActivityMedia({ id: 'a1', mediaId: 'm1' }, { user: { id: 'u1' } } as never),
    ).rejects.toBe(error);
    await expect(controller.getLocationsByActivityId({ id: 'a1' }, request)).rejects.toBe(error);
    await expect(controller.getActivitiesByActivitiesIds(activityIds[0])).rejects.toBe(error);
    await expect(
      controller.createActivity({ duration: 1, distance: 2, speed: 3, sport: 'run' }, { id: 'u1' }),
    ).rejects.toBe(error);
    await expect(
      controller.patchActivity({ duration: 1, distance: 2, speed: 3, sport: 'run' }, { id: 'a1' }),
    ).rejects.toBe(error);
    await expect(controller.getActivitiesByUserId({ id: 'u1' }, undefined, '10')).rejects.toBe(error);
    await expect(controller.getAllActivitiesWithFriends({ id: 'u1' }, undefined, '10')).rejects.toBe(error);
    await expect(controller.getFavoriteActivities({ user: { id: 'u1' } } as never)).rejects.toBe(error);
    await expect(
      controller.setActivityFavorite({ isFavorite: true }, { id: 'a1' }, { user: { id: 'u1' } } as never),
    ).rejects.toBe(error);
    await expect(controller.getActivityByActivityId({ id: 'a1' }, request)).rejects.toBe(error);
    await expect(controller.deleteActivityById({ id: 'a1' })).rejects.toBe(error);
  });
});
