import { jest } from '@jest/globals';
import { JwtStrategy } from '../strategies/jwt.strategy';

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function sessionClaims() {
  return { userId: 'user-1', sessionId: 'session-1' };
}

describe('JwtStrategy', () => {
  const prisma = {
    user: { findUnique: asyncMock() },
    userSession: { findUnique: asyncMock(), updateMany: asyncMock() },
  };
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    strategy = new JwtStrategy(prisma as never);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
  });

  it('rejects non-access tokens and unknown users', async () => {
    await expect(strategy.validate({ userId: 'user-1', type: 'refresh' })).rejects.toThrow('access token');

    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ userId: 'missing' })).rejects.toThrow('Требуется авторизация');
  });

  it('returns a user for a token without a session', async () => {
    await expect(strategy.validate({ userId: 'user-1' })).resolves.toEqual({
      id: 'user-1',
      email: 'user@example.com',
      sessionId: undefined,
    });
    expect(prisma.userSession.findUnique).not.toHaveBeenCalled();
  });

  it('rejects missing, revoked and foreign sessions', async () => {
    prisma.userSession.findUnique.mockResolvedValue(null);
    await expect(strategy.validate(sessionClaims())).rejects.toThrow('Сессия завершена');

    prisma.userSession.findUnique.mockResolvedValue({
      userId: 'user-1',
      revokedAt: new Date(),
      lastSeenAt: new Date(),
    });
    await expect(strategy.validate(sessionClaims())).rejects.toThrow('Сессия завершена');

    prisma.userSession.findUnique.mockResolvedValue({
      userId: 'other-user',
      revokedAt: null,
      lastSeenAt: new Date(),
    });
    await expect(strategy.validate(sessionClaims())).rejects.toThrow('Сессия завершена');
  });

  it('refreshes an idle session timestamp and keeps a recent session untouched', async () => {
    prisma.userSession.findUnique.mockResolvedValue({
      userId: 'user-1',
      revokedAt: null,
      lastSeenAt: new Date(Date.now() - 6 * 60 * 1000),
    });
    prisma.userSession.updateMany.mockResolvedValue({ count: 1 });

    await expect(strategy.validate(sessionClaims())).resolves.toMatchObject({
      id: 'user-1',
      sessionId: 'session-1',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, bannedUntil: true },
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        lastSeenAt: { lt: expect.any(Date) },
      },
      data: { lastSeenAt: expect.any(Date) },
    });

    prisma.userSession.findUnique.mockResolvedValue({
      userId: 'user-1',
      revokedAt: null,
      lastSeenAt: new Date(),
    });
    prisma.userSession.updateMany.mockClear();
    await strategy.validate(sessionClaims());
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
  });
});
