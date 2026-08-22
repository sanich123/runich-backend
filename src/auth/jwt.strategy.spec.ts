import { jest } from '@jest/globals';
import { JwtStrategy } from './jwt.strategy';

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe('JwtStrategy', () => {
  const prisma = {
    users: { findUnique: asyncMock() },
    userSession: { findUnique: asyncMock(), update: asyncMock() },
  };
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    strategy = new JwtStrategy(prisma as never);
    prisma.users.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
  });

  it('rejects non-access tokens and unknown users', async () => {
    await expect(strategy.validate({ userId: 'user-1', type: 'refresh' })).rejects.toThrow('access token');

    prisma.users.findUnique.mockResolvedValue(null);
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
    await expect(strategy.validate({ userId: 'user-1', sessionId: 'session-1' })).rejects.toThrow('Сессия завершена');

    prisma.userSession.findUnique.mockResolvedValue({
      id: 'session-1',
      user_id: 'user-1',
      revoked_at: new Date(),
      last_seen_at: new Date(),
    });
    await expect(strategy.validate({ userId: 'user-1', sessionId: 'session-1' })).rejects.toThrow('Сессия завершена');

    prisma.userSession.findUnique.mockResolvedValue({
      id: 'session-1',
      user_id: 'other-user',
      revoked_at: null,
      last_seen_at: new Date(),
    });
    await expect(strategy.validate({ userId: 'user-1', sessionId: 'session-1' })).rejects.toThrow('Сессия завершена');
  });

  it('refreshes an idle session timestamp and keeps a recent session untouched', async () => {
    prisma.userSession.findUnique.mockResolvedValue({
      id: 'session-1',
      user_id: 'user-1',
      revoked_at: null,
      last_seen_at: new Date(Date.now() - 6 * 60 * 1000),
    });
    prisma.userSession.update.mockResolvedValue(undefined);

    await expect(strategy.validate({ userId: 'user-1', sessionId: 'session-1' })).resolves.toMatchObject({
      id: 'user-1',
      sessionId: 'session-1',
    });
    expect(prisma.userSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { last_seen_at: expect.any(Date) },
    });

    prisma.userSession.findUnique.mockResolvedValue({
      id: 'session-1',
      user_id: 'user-1',
      revoked_at: null,
      last_seen_at: new Date(),
    });
    prisma.userSession.update.mockClear();
    await strategy.validate({ userId: 'user-1', sessionId: 'session-1' });
    expect(prisma.userSession.update).not.toHaveBeenCalled();
  });
});
