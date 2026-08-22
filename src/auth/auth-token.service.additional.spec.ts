import { UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { AuthTokenService } from './auth-token.service';

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();
const syncMock = () => jest.fn<(...args: unknown[]) => unknown>();

function jwtMock() {
  return {
    sign: jest.fn<(...args: unknown[]) => string>().mockReturnValue('signed-token'),
    verify: syncMock(),
  };
}

function session() {
  return {
    id: 'session-1',
    user_id: 'user-1',
    refresh_hash: createHash('sha256').update('refresh-token').digest('hex'),
    revoked_at: null,
    ip_address: 'old-ip',
    user_agent: 'old-agent',
    device_model: 'old-model',
    manufacturer: 'old-manufacturer',
    os_name: 'old-os',
    os_version: 'old-version',
    device_type: 'old-device',
    app_version: 'old-app',
    app_build: 'old-build',
    last_seen_at: new Date(),
  };
}

describe('AuthTokenService persistence branches', () => {
  it('uses stateless credentials when Prisma is unavailable', async () => {
    const jwt = jwtMock();
    const service = new AuthTokenService(jwt as never);

    expect(service.hasPersistentStore()).toBe(false);
    await expect(service.createEmailLoginCredential('user-1')).resolves.toEqual(expect.any(String));
    await expect(service.createSessionTokens('user-1')).resolves.toMatchObject({ userId: 'user-1' });

    jwt.verify.mockReturnValue({ userId: 'user-1' });
    await expect(service.refreshAccessToken('refresh-token')).resolves.toEqual({ accessToken: 'signed-token' });
  });

  it('stores and consumes one-time email login credentials', async () => {
    const jwt = jwtMock();
    const prisma = {
      authExchange: {
        create: asyncMock(),
      },
      $transaction: asyncMock(),
    };
    const service = new AuthTokenService(jwt as never, prisma as never);
    prisma.authExchange.create.mockResolvedValue(undefined);

    const code = await service.createEmailLoginCredential('user-1');
    expect(code).toEqual(expect.any(String));
    expect(prisma.authExchange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ user_id: 'user-1', purpose: 'email_login' }),
    });
    const createCall = prisma.authExchange.create.mock.calls[0]?.[0] as { data: { code_hash: string } };
    expect(createCall.data.code_hash).not.toBe(code);

    const transaction = {
      authExchange: {
        updateMany: asyncMock().mockResolvedValue({ count: 1 }),
        findUnique: asyncMock().mockResolvedValue({ user_id: 'user-1' }),
      },
    };
    prisma.$transaction.mockImplementation((async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction)) as never);
    await expect(service.consumeEmailLoginCode(code)).resolves.toBe('user-1');
    expect(transaction.authExchange.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ code_hash: expect.any(String) }) }),
    );
  });

  it('rejects missing, expired and reused email login credentials', async () => {
    const jwt = jwtMock();
    const transaction = {
      authExchange: {
        updateMany: asyncMock().mockResolvedValue({ count: 0 }),
        findUnique: asyncMock(),
      },
    };
    const prisma = {
      authExchange: { create: asyncMock() },
      $transaction: asyncMock(),
    };
    prisma.$transaction.mockImplementation((async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction)) as never);
    const service = new AuthTokenService(jwt as never, prisma as never);

    await expect(service.consumeEmailLoginCode('invalid')).rejects.toThrow(UnauthorizedException);
    expect(transaction.authExchange.findUnique).not.toHaveBeenCalled();
  });

  it('creates persistent session tokens with device metadata', async () => {
    const jwt = jwtMock();
    const prisma = {
      userSession: { create: asyncMock() },
    };
    const service = new AuthTokenService(jwt as never, prisma as never);

    await expect(
      service.createSessionTokens('user-1', {
        deviceId: 'device-1',
        deviceName: 'Phone',
        platform: 'ios',
        model: 'iPhone',
        manufacturer: 'Apple',
        osName: 'iOS',
        osVersion: '18',
        deviceType: 'phone',
        appVersion: '1.0',
        appBuild: '10',
        userAgent: 'agent',
        ipAddress: '127.0.0.1',
      }),
    ).resolves.toMatchObject({ userId: 'user-1', accessToken: 'signed-token', refreshToken: 'signed-token' });
    expect(prisma.userSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: expect.any(String), user_id: 'user-1', device_id: 'device-1' }),
    });
  });

  it('refreshes valid persistent sessions and updates supplied metadata', async () => {
    const jwt = jwtMock();
    jwt.verify.mockReturnValue({ userId: 'user-1', type: 'refresh', sessionId: 'session-1' });
    const prisma = {
      userSession: {
        findUnique: asyncMock().mockResolvedValue(session()),
        updateMany: asyncMock().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new AuthTokenService(jwt as never, prisma as never);

    await expect(
      service.refreshAccessToken('refresh-token', { ipAddress: 'new-ip', model: 'new-model' }),
    ).resolves.toEqual({
      accessToken: 'signed-token',
      refreshToken: 'signed-token',
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'session-1', user_id: 'user-1', revoked_at: null }),
      data: expect.objectContaining({ ip_address: 'new-ip', device_model: 'new-model' }),
    });
  });

  it.each([
    ['missing session', null],
    ['revoked session', { ...session(), revoked_at: new Date() }],
    ['different refresh hash', { ...session(), refresh_hash: 'different' }],
  ])('rejects a %s', async (_description, value) => {
    const jwt = jwtMock();
    jwt.verify.mockReturnValue({ userId: 'user-1', type: 'refresh', sessionId: 'session-1' });
    const prisma = {
      userSession: {
        findUnique: asyncMock().mockResolvedValue(value),
        updateMany: asyncMock(),
      },
    };
    const service = new AuthTokenService(jwt as never, prisma as never);

    await expect(service.refreshAccessToken('refresh-token')).rejects.toThrow('Сессия завершена');
  });

  it('rejects a session lost during the conditional rotation update', async () => {
    const jwt = jwtMock();
    jwt.verify.mockReturnValue({ userId: 'user-1', type: 'refresh', sessionId: 'session-1' });
    const prisma = {
      userSession: {
        findUnique: asyncMock().mockResolvedValue(session()),
        updateMany: asyncMock().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new AuthTokenService(jwt as never, prisma as never);

    await expect(service.refreshAccessToken('refresh-token')).rejects.toThrow('Сессия завершена');
  });

  it.each([
    ['invalid token', new Error('invalid')],
    ['wrong token type', { userId: 'user-1', type: 'access' }],
    ['missing user id', {}],
  ])('rejects %s', async (_description, verification) => {
    const jwt = jwtMock();
    jwt.verify.mockImplementation(() => {
      if (verification instanceof Error) throw verification;
      return verification;
    });
    const prisma = { userSession: { findUnique: asyncMock(), updateMany: asyncMock() } };
    const service = new AuthTokenService(jwt as never, prisma as never);

    await expect(service.refreshAccessToken('refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
