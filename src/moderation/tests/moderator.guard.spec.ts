import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { asyncMock } from 'src/tests/helpers';
import { AdminAccessService } from 'src/admin/admin-access.service';
import { ModeratorGuard } from '../moderator.guard';

describe('ModeratorGuard', () => {
  const access = { hasPermission: asyncMock() };
  const guard = new ModeratorGuard(access as unknown as AdminAccessService);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'user-1' } }) }),
  } as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('allows users with the moderation permission and rejects users without it', async () => {
    access.hasPermission.mockResolvedValue(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(access.hasPermission).toHaveBeenCalledWith('user-1', 'moderation.manage');

    access.hasPermission.mockResolvedValue(false);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
