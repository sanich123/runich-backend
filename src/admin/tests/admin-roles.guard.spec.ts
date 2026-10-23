import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { asyncMock } from 'src/tests/helpers';
import { AdminAccessService } from '../admin-access.service';
import { AdminRolesGuard } from '../admin-roles.guard';

describe('AdminRolesGuard', () => {
  const adminAccess = { hasPermission: asyncMock() };
  const guard = new AdminRolesGuard(adminAccess as unknown as AdminAccessService);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'session-user', userId: 'authenticated-user' } }),
    }),
  } as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('allows access managers and rejects users without role management permission', async () => {
    adminAccess.hasPermission.mockResolvedValue(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(adminAccess.hasPermission).toHaveBeenCalledWith('authenticated-user', 'admin.roles.manage');

    adminAccess.hasPermission.mockResolvedValue(false);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
