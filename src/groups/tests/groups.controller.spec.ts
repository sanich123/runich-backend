import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { asyncMock } from 'src/tests/helpers';
import { GroupsController } from '../groups.controller';
import { encodeGroupDateCursor, encodeGroupDistanceCursor } from '../groups.pagination';

describe('GroupsController', () => {
  it('uses the authenticated user and defaults the member status to active', async () => {
    const groupsService = { getMembers: asyncMock() };
    const controller = new GroupsController(groupsService as never);
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    groupsService.getMembers.mockResolvedValue([]);

    await controller.getMembers(request, 'group-1', {});

    expect(groupsService.getMembers).toHaveBeenCalledWith('user-1', 'group-1', 'active', 100, undefined, false);
  });

  it('passes explicit pending membership status through to the service', async () => {
    const groupsService = { getMembers: asyncMock() };
    const controller = new GroupsController(groupsService as never);
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
    const controller = new GroupsController(groupsService as never);
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
    const controller = new GroupsController(groupsService as never);
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    const preferences = { notificationPreference: 'off', feedPreference: 'admins' } as const;

    await controller.updatePreferences(request, 'group-1', preferences);

    expect(groupsService.updatePreferences).toHaveBeenCalledWith('user-1', 'group-1', preferences);
  });

  it('passes group post creation to the service with the authenticated user', async () => {
    const groupsService = { createPost: asyncMock() };
    const controller = new GroupsController(groupsService as never);
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    const body = { text: 'Sunday run' };

    await controller.createPost(request, 'group-1', body);

    expect(groupsService.createPost).toHaveBeenCalledWith('user-1', 'group-1', body);
  });

  it('defaults group events to upcoming and passes the selected period', async () => {
    const groupsService = { getEvents: asyncMock() };
    const controller = new GroupsController(groupsService as never);
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
    const controller = new GroupsController(groupsService as never);
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
    const controller = new GroupsController(groupsService as never);
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    const body = { title: 'Sunday run', startsAt: '2026-10-31T10:00:00.000Z' };

    await controller.createEvent(request, 'group-1', body);

    expect(groupsService.createEvent).toHaveBeenCalledWith('user-1', 'group-1', body);
  });
});
