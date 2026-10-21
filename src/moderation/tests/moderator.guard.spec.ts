import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { asyncMock } from 'src/tests/helpers';
import { MODERATOR_EMAIL } from '../moderation.constants';
import { ModeratorGuard } from '../moderator.guard';

describe('ModeratorGuard', () => {
  const prisma = { user: { findUnique: asyncMock() } };
  const guard = new ModeratorGuard(prisma as never);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'user-1' } }) }),
  } as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('allows the confirmed moderator and rejects unknown, unconfirmed, or other users', async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: ` ${MODERATOR_EMAIL.toUpperCase()} `,
      emailConfirmedAt: new Date(),
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { email: true, emailConfirmedAt: true },
    });

    prisma.user.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findUnique.mockResolvedValue({ email: MODERATOR_EMAIL, emailConfirmedAt: null });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findUnique.mockResolvedValue({ email: 'other@example.com', emailConfirmedAt: new Date() });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findUnique.mockResolvedValue({ email: null, emailConfirmedAt: new Date() });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
