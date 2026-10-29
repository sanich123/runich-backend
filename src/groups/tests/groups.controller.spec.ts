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
});
