import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { asyncMock } from 'src/tests/helpers';
import { GroupsController } from '../groups.controller';

describe('GroupsController', () => {
  it('uses the authenticated user and defaults the member status to active', async () => {
    const groupsService = { getMembers: asyncMock() };
    const controller = new GroupsController(groupsService as never);
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    groupsService.getMembers.mockResolvedValue([]);

    await controller.getMembers(request, 'group-1', {});

    expect(groupsService.getMembers).toHaveBeenCalledWith('user-1', 'group-1', 'active');
  });

  it('passes explicit pending membership status through to the service', async () => {
    const groupsService = { getMembers: asyncMock() };
    const controller = new GroupsController(groupsService as never);
    const request = { user: { id: 'user-1', userId: 'session-user-1' } } as AuthenticatedRequest;
    groupsService.getMembers.mockResolvedValue([]);

    await controller.getMembers(request, 'group-1', { status: 'pending' });

    expect(groupsService.getMembers).toHaveBeenCalledWith('session-user-1', 'group-1', 'pending');
  });

  it('validates and passes monthly leaderboard filters to the service', async () => {
    const groupsService = { getMonthlyLeaderboard: asyncMock() };
    const controller = new GroupsController(groupsService as never);
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;
    groupsService.getMonthlyLeaderboard.mockResolvedValue({ items: [] });

    await controller.getMonthlyLeaderboard(request, 'group-1', '2026', '9', 'Europe/Moscow');

    expect(groupsService.getMonthlyLeaderboard).toHaveBeenCalledWith('user-1', 'group-1', 2026, 9, 'Europe/Moscow');

    await controller.getMonthlyLeaderboard(request, 'group-1');

    expect(groupsService.getMonthlyLeaderboard).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'group-1',
      undefined,
      undefined,
      undefined,
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

    expect(groupsService.getEvents).toHaveBeenNthCalledWith(1, 'user-1', 'group-1', 'upcoming');
    expect(groupsService.getEvents).toHaveBeenNthCalledWith(2, 'user-1', 'group-1', 'past');
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
