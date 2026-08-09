import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { asyncMock, syncMock } from 'src/__tests__/helpers';

describe('AuthController', () => {
  const authService = {
    signUp: asyncMock(),
    login: asyncMock(),
    refreshAccessToken: syncMock(),
    verifyToken: asyncMock(),
    confirmEmailByCode: asyncMock(),
    authInFromEmailLink: asyncMock(),
    deleteUser: asyncMock(),
  };
  const prismaService = { users: { findUnique: asyncMock() } };
  const controller = new AuthController(
    authService as unknown as AuthService,
    prismaService as unknown as PrismaService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns the minimum supported app version', () => {
    expect(controller.getConfig()).toEqual({ minAppVersion: '4.0.0' });
  });

  it('returns service results for every auth endpoint', async () => {
    const auth = { id: 'user-1', accessToken: 'access-token' };
    prismaService.users.findUnique.mockResolvedValue(null);
    authService.signUp.mockResolvedValue({ message: 'sent' });
    authService.login.mockResolvedValue(auth);
    authService.refreshAccessToken.mockReturnValue({ accessToken: 'new-access-token' });
    authService.verifyToken.mockResolvedValue(auth);
    authService.confirmEmailByCode.mockResolvedValue(auth);
    authService.authInFromEmailLink.mockResolvedValue({ message: 'sent' });
    authService.deleteUser.mockResolvedValue(undefined);

    await expect(controller.registerUser({ email: 'user@example.com', password: 'secret123' })).resolves.toEqual({
      message: 'sent',
    });
    await expect(controller.login({ email: 'user@example.com', password: 'secret123' })).resolves.toEqual(auth);
    await expect(controller.refresh({ refreshToken: 'refresh-token' })).resolves.toEqual({
      accessToken: 'new-access-token',
    });
    await expect(controller.verifyTokenAndAppVersion({ accessToken: 'access-token' })).resolves.toEqual(auth);
    await expect(
      controller.confirmEmailByCode({ confirmationCode: '1234', email: 'user@example.com' }),
    ).resolves.toEqual(auth);
    await expect(controller.resetPassword({ email: 'user@example.com' })).resolves.toEqual({ message: 'sent' });
    await expect(controller.deleteUser({ userId: 'user-1' })).resolves.toBeUndefined();
    expect(authService.signUp).toHaveBeenCalledWith('user@example.com', 'secret123');
    expect(authService.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
  });

  it('rejects registration for an already confirmed email', async () => {
    prismaService.users.findUnique.mockResolvedValue({ email_confirmed_at: new Date() });

    await expect(controller.registerUser({ email: 'user@example.com', password: 'secret123' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(authService.signUp).not.toHaveBeenCalled();
  });

  it('propagates database and service errors from every auth endpoint', async () => {
    const error = new Error('service failed');
    prismaService.users.findUnique.mockRejectedValue(error);
    await expect(controller.registerUser({ email: 'user@example.com', password: 'secret123' })).rejects.toBe(error);

    prismaService.users.findUnique.mockResolvedValue(null);
    authService.signUp.mockRejectedValue(error);
    authService.login.mockRejectedValue(error);
    authService.refreshAccessToken.mockImplementation(() => {
      throw error;
    });
    authService.verifyToken.mockRejectedValue(error);
    authService.confirmEmailByCode.mockRejectedValue(error);
    authService.authInFromEmailLink.mockRejectedValue(error);
    authService.deleteUser.mockRejectedValue(error);

    await expect(controller.registerUser({ email: 'user@example.com', password: 'secret123' })).rejects.toBe(error);
    await expect(controller.login({ email: 'user@example.com', password: 'secret123' })).rejects.toBe(error);
    await expect(controller.refresh({ refreshToken: 'refresh-token' })).rejects.toBe(error);
    await expect(controller.verifyTokenAndAppVersion({ accessToken: 'access-token' })).rejects.toBe(error);
    await expect(controller.confirmEmailByCode({ confirmationCode: '1234', email: 'user@example.com' })).rejects.toBe(
      error,
    );
    await expect(controller.resetPassword({ email: 'user@example.com' })).rejects.toBe(error);
    await expect(controller.deleteUser({ userId: 'user-1' })).rejects.toBe(error);
  });
});
