import { UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { AuthTokenService } from '../services/auth-token.service';
import { makePersistedSession, makeRefreshTokenClaims } from './fixtures';

describe('AuthTokenService refresh rotation', () => {
  function createService(updateCounts: number[]) {
    const prisma = {
      userSession: {
        findUnique: jest.fn().mockResolvedValue(
          makePersistedSession({
            refreshHash: createHash('sha256').update('refresh-token').digest('hex'),
          }) as never,
        ),
        updateMany: jest.fn().mockImplementation(async () => ({ count: updateCounts.shift() ?? 0 })),
      },
    };
    const jwt = {
      verify: jest.fn().mockReturnValue(makeRefreshTokenClaims()),
      sign: jest.fn().mockReturnValue('rotated-token'),
    };
    return { service: new AuthTokenService(jwt as never, prisma as never), prisma, jwt };
  }

  it('accepts the first refresh and rejects a replay of the same token', async () => {
    const { service, prisma } = createService([1, 0]);
    const results = await Promise.allSettled([
      service.refreshAccessToken('refresh-token'),
      service.refreshAccessToken('refresh-token'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.userSession.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'session-1',
          userId: 'user-1',
          revokedAt: null,
        }),
      }),
    );
  });

  it('rejects an access token submitted to the refresh endpoint', async () => {
    const { service, jwt } = createService([1]);
    jwt.verify.mockReturnValue({ userId: 'user-1', type: 'access', sessionId: 'session-1' });

    await expect(service.refreshAccessToken('access-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
