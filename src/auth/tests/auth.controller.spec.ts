import { jest } from '@jest/globals';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { AuthService } from '../services/auth.service';
import { AuthController } from '../controllers/auth.controller';
import { asyncMock, syncMock } from 'src/tests/helpers';
import { makeSessionTokens } from './fixtures';

describe('AuthController', () => {
  const authService = {
    signUp: asyncMock(),
    login: asyncMock(),
    sendLoginLinkByEmail: asyncMock(),
    refreshAccessToken: syncMock(),
    logout: asyncMock(),
    verifyToken: asyncMock(),
    confirmEmailByCode: asyncMock(),
    getEmailCodeForPassword: asyncMock(),
    verifyPasswordChangeCode: asyncMock(),
    changePassword: asyncMock(),
    deleteUser: asyncMock(),
  };
  const prismaService = { user: { findUnique: asyncMock() } };
  const controller = new AuthController(
    authService as unknown as AuthService,
    prismaService as unknown as PrismaService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns the minimum supported app version', () => {
    expect(controller.getConfig()).toEqual({ appVersion: '1.0.0' });
  });

  it('returns service results for every auth endpoint', async () => {
    const auth = { id: 'user-1', accessToken: 'access-token' };
    prismaService.user.findUnique.mockResolvedValue(null);
    authService.signUp.mockResolvedValue({ message: 'sent' });
    authService.login.mockResolvedValue(auth);
    authService.sendLoginLinkByEmail.mockResolvedValue({ message: 'sent' });
    authService.refreshAccessToken.mockReturnValue({ accessToken: 'new-access-token' });
    authService.verifyToken.mockResolvedValue(auth);
    authService.confirmEmailByCode.mockResolvedValue(auth);
    authService.getEmailCodeForPassword.mockResolvedValue({ message: 'sent' });
    authService.verifyPasswordChangeCode.mockResolvedValue({ message: 'verified' });
    authService.changePassword.mockResolvedValue(makeSessionTokens());
    authService.deleteUser.mockResolvedValue(undefined);

    await expect(controller.registerUser({ email: 'user@yandex.ru', password: 'secret123' })).resolves.toEqual({
      message: 'sent',
    });
    await expect(controller.login({ email: 'user@example.com', password: 'secret123' })).resolves.toEqual(auth);
    await expect(controller.sendLoginLinkByEmail({ email: 'user@example.com' })).resolves.toEqual({ message: 'sent' });
    await expect(controller.refresh({ refreshToken: 'refresh-token' })).resolves.toEqual({
      accessToken: 'new-access-token',
    });
    await expect(controller.verifyTokenAndAppVersion({ code: 'login-code' })).resolves.toEqual(auth);
    await expect(
      controller.confirmEmailByCode({ confirmationCode: '1234', email: 'user@example.com' }),
    ).resolves.toEqual(auth);
    await expect(controller.getEmailCodeForPassword({ email: 'user@example.com' })).resolves.toEqual({
      message: 'sent',
    });
    await expect(
      controller.verifyPasswordChangeCode({ email: 'user@example.com', confirmationCode: '123456' }),
    ).resolves.toEqual({ message: 'verified' });
    await expect(
      controller.changePassword({
        email: 'user@example.com',
        password1: 'NewPassword1',
        password2: 'NewPassword1',
      }),
    ).resolves.toEqual({ userId: 'user-1', accessToken: 'access-token', refreshToken: 'refresh-token' });
    await expect(controller.deleteUser({ userId: 'user-1' })).resolves.toBeUndefined();
    expect(authService.signUp).toHaveBeenCalledWith('user@yandex.ru', 'secret123');
    expect(authService.sendLoginLinkByEmail).toHaveBeenCalledWith('user@example.com');
    expect(authService.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(authService.getEmailCodeForPassword).toHaveBeenCalledWith('user@example.com');
    expect(authService.verifyPasswordChangeCode).toHaveBeenCalledWith('123456', 'user@example.com');
    expect(authService.changePassword).toHaveBeenCalledWith('NewPassword1', 'NewPassword1', 'user@example.com');
  });

  it('normalizes email before registration lookup, registration delegation and login delegation', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);
    authService.signUp.mockResolvedValue({ message: 'sent' });
    authService.login.mockResolvedValue({ userId: 'user-1' });

    await controller.registerUser({ email: ' USER@YANDEX.RU ', password: 'secret123' });
    await controller.login({ email: ' USER@EXAMPLE.COM ', password: 'secret123' });

    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@yandex.ru' },
      select: { emailConfirmedAt: true, authProvider: true },
    });
    expect(authService.signUp).toHaveBeenCalledWith('user@yandex.ru', 'secret123');
    expect(authService.login).toHaveBeenCalledWith('user@example.com', 'secret123');
  });

  it('rejects registration for an already confirmed email', async () => {
    prismaService.user.findUnique.mockResolvedValue({ emailConfirmedAt: new Date() });

    await expect(controller.registerUser({ email: 'user@yandex.ru', password: 'secret123' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(authService.signUp).not.toHaveBeenCalled();
  });

  it('rejects registration with a foreign email domain', async () => {
    await expect(controller.registerUser({ email: 'user@gmail.com', password: 'secret123' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    expect(authService.signUp).not.toHaveBeenCalled();
  });

  it('propagates database and service errors from every auth endpoint', async () => {
    const error = new Error('service failed');
    prismaService.user.findUnique.mockRejectedValue(error);
    await expect(controller.registerUser({ email: 'user@yandex.ru', password: 'secret123' })).rejects.toBe(error);

    prismaService.user.findUnique.mockResolvedValue(null);
    authService.signUp.mockRejectedValue(error);
    authService.login.mockRejectedValue(error);
    authService.sendLoginLinkByEmail.mockRejectedValue(error);
    authService.refreshAccessToken.mockImplementation(() => {
      throw error;
    });
    authService.verifyToken.mockRejectedValue(error);
    authService.confirmEmailByCode.mockRejectedValue(error);
    authService.getEmailCodeForPassword.mockRejectedValue(error);
    authService.verifyPasswordChangeCode.mockRejectedValue(error);
    authService.changePassword.mockRejectedValue(error);
    authService.deleteUser.mockRejectedValue(error);

    await expect(controller.registerUser({ email: 'user@yandex.ru', password: 'secret123' })).rejects.toBe(error);
    await expect(controller.login({ email: 'user@example.com', password: 'secret123' })).rejects.toBe(error);
    await expect(controller.sendLoginLinkByEmail({ email: 'user@example.com' })).rejects.toBe(error);
    await expect(controller.refresh({ refreshToken: 'refresh-token' })).rejects.toBe(error);
    await expect(controller.verifyTokenAndAppVersion({ code: 'login-code' })).rejects.toBe(error);
    await expect(controller.confirmEmailByCode({ confirmationCode: '1234', email: 'user@example.com' })).rejects.toBe(
      error,
    );
    await expect(controller.getEmailCodeForPassword({ email: 'user@example.com' })).rejects.toBe(error);
    await expect(
      controller.verifyPasswordChangeCode({ email: 'user@example.com', confirmationCode: '123456' }),
    ).rejects.toBe(error);
    await expect(
      controller.changePassword({
        email: 'user@example.com',
        password1: 'NewPassword1',
        password2: 'NewPassword1',
      }),
    ).rejects.toBe(error);
    await expect(controller.deleteUser({ userId: 'user-1' })).rejects.toBe(error);
  });
});
