import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { asyncMock } from 'src/tests/helpers';
import { GroupsController } from '../groups.controller';
import { GroupsEventsService } from '../services/groups-events.service';
import { GroupsMembersService } from '../services/groups-members.service';
import { GroupsPostsService } from '../services/groups-posts.service';
import { GroupsStatisticsService } from '../services/groups-statistics.service';
import { GroupSummaryService } from '../services/groups-summary.service';
import { GroupsService } from '../services/groups.service';
import { encodeGroupDateCursor, encodeGroupDistanceCursor } from '../shared/groups.pagination';

function createController(
  services: Partial<{
    groups: object;
    summary: object;
    members: object;
    statistics: object;
    posts: object;
    events: object;
  }>,
) {
  return new GroupsController(
    (services.groups ?? {}) as never,
    (services.summary ?? {}) as never,
    (services.members ?? {}) as never,
    (services.statistics ?? {}) as never,
    (services.posts ?? {}) as never,
    (services.events ?? {}) as never,
  );
}

describe('GroupsController', () => {
  it('declares explicit service injection tokens for tsx bootstrap', () => {
    const dependencies: Array<{ index: number; param: unknown }> = Reflect.getMetadata(
      SELF_DECLARED_DEPS_METADATA,
      GroupsController,
    );
    expect(dependencies.sort((left, right) => left.index - right.index)).toEqual([
      { index: 0, param: GroupsService },
      { index: 1, param: GroupSummaryService },
      { index: 2, param: GroupsMembersService },
      { index: 3, param: GroupsStatisticsService },
      { index: 4, param: GroupsPostsService },
      { index: 5, param: GroupsEventsService },
    ]);
  });

  it('uses the authenticated user and defaults the member status to active', async () => {
    const groupsService = { getMembers: asyncMock() };
    const controller = createController({ members: groupsService });
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    groupsService.getMembers.mockResolvedValue([]);

    await controller.getMembers(request, 'group-1', {});

    expect(groupsService.getMembers).toHaveBeenCalledWith('user-1', 'group-1', 'active', 100, undefined, false);
  });

  it('passes explicit pending membership status through to the service', async () => {
    const groupsService = { getMembers: asyncMock() };
    const controller = createController({ members: groupsService });
    const request = { user: { id: 'user-1', userId: 'session-user-1' } } as AuthenticatedRequest;
    groupsService.getMembers.mockResolvedValue([]);

    await controller.getMembers(request, 'group-1', { status: 'pending' });

    expect(groupsService.getMembers).toHaveBeenCalledWith(
      'session-user-1',
      'group-1',
      'pending',
      100,
      undefined,
      false,
    );
  });

  it('validates and passes monthly leaderboard filters to the service', async () => {
    const groupsService = { getMonthlyLeaderboard: asyncMock() };
    const controller = createController({ statistics: groupsService });
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    groupsService.getMonthlyLeaderboard.mockResolvedValue({ items: [] });

    await controller.getMonthlyLeaderboard(request, 'group-1', '2026', '9', 'Europe/Moscow');

    expect(groupsService.getMonthlyLeaderboard).toHaveBeenCalledWith(
      'user-1',
      'group-1',
      2026,
      9,
      'Europe/Moscow',
      100,
      undefined,
      false,
    );

    await controller.getMonthlyLeaderboard(request, 'group-1');

    expect(groupsService.getMonthlyLeaderboard).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'group-1',
      undefined,
      undefined,
      undefined,
      100,
      undefined,
      false,
    );
  });

  it('updates preferences for the authenticated member', async () => {
    const groupsService = { updatePreferences: asyncMock() };
    const controller = createController({ members: groupsService });
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    const preferences = { notificationPreference: 'off', feedPreference: 'admins' } as const;

    await controller.updatePreferences(request, 'group-1', preferences);

    expect(groupsService.updatePreferences).toHaveBeenCalledWith('user-1', 'group-1', preferences);
  });

  it('passes group post creation to the service with the authenticated user', async () => {
    const groupsService = { createPost: asyncMock() };
    const controller = createController({ posts: groupsService });
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    const body = { text: 'Sunday run' };

    await controller.createPost(request, 'group-1', body);

    expect(groupsService.createPost).toHaveBeenCalledWith('user-1', 'group-1', body);
  });

  it('defaults group events to upcoming and passes the selected period', async () => {
    const groupsService = { getEvents: asyncMock() };
    const controller = createController({ events: groupsService });
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;

    await controller.getEvents(request, 'group-1', {});
    await controller.getEvents(request, 'group-1', { period: 'past' });

    expect(groupsService.getEvents).toHaveBeenNthCalledWith(1, 'user-1', 'group-1', 'upcoming', 100, undefined, false);
    expect(groupsService.getEvents).toHaveBeenNthCalledWith(2, 'user-1', 'group-1', 'past', 100, undefined, false);
  });

  it('parses pagination limits and cursors for member, leaderboard, post, and event lists', async () => {
    const groupsService = {
      getMembers: asyncMock(),
      getMonthlyLeaderboard: asyncMock(),
      getPosts: asyncMock(),
      getEvents: asyncMock(),
    };
    const controller = createController({
      members: groupsService,
      statistics: groupsService,
      posts: groupsService,
      events: groupsService,
    });
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    const date = new Date('2026-10-29T10:00:00.000Z');
    const dateCursor = encodeGroupDateCursor({ date, id: 'item-42' });
    const distanceCursor = encodeGroupDistanceCursor({ totalDistance: 12500, userId: 'runner-42' });

    await controller.getMembers(request, 'group-1', { status: 'pending', limit: '25', cursor: dateCursor });
    await controller.getMonthlyLeaderboard(request, 'group-1', undefined, undefined, undefined, '15', distanceCursor);
    await controller.getPosts(request, 'group-1', '10', dateCursor);
    await controller.getEvents(request, 'group-1', { period: 'past', limit: '20', cursor: dateCursor });

    expect(groupsService.getMembers).toHaveBeenCalledWith(
      'user-1',
      'group-1',
      'pending',
      25,
      { date, id: 'item-42' },
      true,
    );
    expect(groupsService.getMonthlyLeaderboard).toHaveBeenCalledWith(
      'user-1',
      'group-1',
      undefined,
      undefined,
      undefined,
      15,
      { totalDistance: 12500, userId: 'runner-42' },
      true,
    );
    expect(groupsService.getPosts).toHaveBeenCalledWith('user-1', 'group-1', 10, { date, id: 'item-42' }, true);
    expect(groupsService.getEvents).toHaveBeenCalledWith(
      'user-1',
      'group-1',
      'past',
      20,
      { date, id: 'item-42' },
      true,
    );
  });

  it('passes event creation to the service with the authenticated user', async () => {
    const groupsService = { createEvent: asyncMock() };
    const controller = createController({ events: groupsService });
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    const body = { title: 'Sunday run', startsAt: '2026-10-31T10:00:00.000Z' };

    await controller.createEvent(request, 'group-1', body);

    expect(groupsService.createEvent).toHaveBeenCalledWith('user-1', 'group-1', body);
  });
});
