import { jest } from '@jest/globals';
import type { Response } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

describe('AuthController VK callback contract', () => {
  const handleVkCallback = jest.fn(
    (_code: string, _state: string, _error: string | undefined, response: Response) =>
      response.redirect('/oauth-complete'),
  );
  const controller = new AuthController(
    { handleVkCallback } as unknown as AuthService,
    {} as PrismaService,
  );

  beforeEach(() => {
    handleVkCallback.mockClear();
  });

  it('passes VK callback device_id to the auth service', () => {
    const response = { redirect: jest.fn() } as unknown as Response;

    controller.vkCallback('provider-code', 'signed-state', undefined, 'device-1', response);

    expect(handleVkCallback).toHaveBeenCalledWith(
      'provider-code',
      'signed-state',
      undefined,
      response,
      'device-1',
    );
    expect(response.redirect).toHaveBeenCalledWith('/oauth-complete');
  });
});
