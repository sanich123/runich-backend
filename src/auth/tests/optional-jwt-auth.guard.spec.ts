import { jest } from '@jest/globals';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../guards/optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();
  const request = { headers: {} as Record<string, string> };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  afterEach(() => jest.restoreAllMocks());

  it('allows requests without an authorization header', async () => {
    request.headers = {};

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('uses the JWT guard when an authorization header is present', async () => {
    const authenticate = jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true);
    request.headers = { authorization: 'Bearer token' };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith(context);
  });
});
