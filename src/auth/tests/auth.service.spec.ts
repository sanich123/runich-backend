import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EmailService } from 'src/email/email.service';
import { asyncMock, expectInternalServerError, syncMock } from 'src/tests/helpers';
import { MediaCleanupService } from 'src/storage/media-cleanup.service';
import { AuthService } from '../services/auth.service';

function createDependencies() {
  return {
    prisma: {
      user: { findUnique: asyncMock(), create: asyncMock(), update: asyncMock(), delete: asyncMock() },
      friend: { deleteMany: asyncMock() },
      $transaction: asyncMock(),
    },
    jwt: { sign: syncMock().mockReturnValue('access-token'), verify: syncMock() },
    email: {
      sendConfirmationCode: asyncMock(),
      sendPasswordChangeCode: asyncMock(),
      sendLoginLink: asyncMock(),
    },
  };
}

describe('AuthService', () => {
  it('resends a confirmation code for an existing unconfirmed user', async () => {
    const dependencies = createDependencies();
    dependencies.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailConfirmedAt: null });
    dependencies.prisma.user.update.mockResolvedValue({ id: 'user-1' });
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    await expect(service.signUp('user@example.com', 'secret123')).resolves.toEqual({
      message: 'Код подтверждения был выслан на Вашу электронную почту',
    });
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1', type: 'email' }, { expiresIn: '5m' });
    expect(dependencies.email.sendConfirmationCode).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(Number),
      'access-token',
    );
    expect(dependencies.prisma.user.update).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      data: { confirmationSentAt: expect.any(Date), confirmationToken: expect.any(String) },
    });
  });

  it('creates a user and sends a confirmation code on first registration', async () => {
    const dependencies = createDependencies();
    dependencies.prisma.user.findUnique.mockResolvedValue(null);
    dependencies.prisma.user.create.mockResolvedValue({ id: 'user-1' });
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    await expect(service.signUp('user@example.com', 'secret123')).resolves.toEqual({
      message: 'Код подтверждения был выслан на Вашу электронную почту',
    });
    expect(dependencies.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'user@example.com',
        encryptedPassword: expect.any(String),
        confirmationToken: expect.any(String),
        confirmationSentAt: expect.any(Date),
        createdAt: expect.any(Date),
        profile: { create: {} },
      }),
    });
    expect(dependencies.email.sendConfirmationCode).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(Number),
      'access-token',
    );
  });

  it('returns service unavailable when confirmation email sending fails', async () => {
    const dependencies = createDependencies();
    dependencies.prisma.user.findUnique.mockResolvedValue(null);
    dependencies.prisma.user.create.mockResolvedValue({ id: 'user-1' });
    dependencies.email.sendConfirmationCode.mockRejectedValue(new Error('mail provider failed'));
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    await expect(service.signUp('user@example.com', 'secret123')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('handles all login outcomes', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.login('missing@example.com', 'secret123')).rejects.toBeInstanceOf(NotFoundException);

    dependencies.prisma.user.findUnique.mockResolvedValueOnce({ encryptedPassword: '$2b$10$invalid' });
    await expect(service.login('user@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);

    dependencies.prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      encryptedPassword: await (await import('bcrypt')).hash('secret123', 4),
    });
    await expect(service.login('user@example.com', 'secret123')).rejects.toBeInstanceOf(UnauthorizedException);

    dependencies.prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      encryptedPassword: await (await import('bcrypt')).hash('secret123', 4),
      emailConfirmedAt: new Date(),
    });
    dependencies.prisma.user.update.mockResolvedValue({ id: 'user-1' });
    await expect(service.login('user@example.com', 'secret123')).resolves.toEqual({
      userId: 'user-1',
      accessToken: 'access-token',
      refreshToken: 'access-token',
    });
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1', type: 'access' }, { expiresIn: '1d' });
    expect(dependencies.jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'refresh', jti: expect.any(String) }),
      { expiresIn: '30d' },
    );
    expect(dependencies.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastSignInAt: expect.any(Date) },
    });
  });

  it('enqueues S3 cleanup before deleting an account', async () => {
    const dependencies = createDependencies();
    const cleanup = { enqueueUserCleanup: asyncMock() };
    dependencies.prisma.$transaction.mockImplementation(((
      callback: (transaction: typeof dependencies.prisma) => Promise<unknown>,
    ) => callback(dependencies.prisma)) as never);
    dependencies.prisma.user.delete.mockResolvedValue({ id: 'user-1' });
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
      undefined,
      undefined,
      undefined,
      undefined,
      cleanup as unknown as MediaCleanupService,
    );

    await expect(service.deleteUser('user-1')).resolves.toEqual({ id: 'user-1' });
    expect(cleanup.enqueueUserCleanup).toHaveBeenCalledWith('user-1', dependencies.prisma);
    expect(dependencies.prisma.friend.deleteMany).toHaveBeenCalled();
    expect(dependencies.prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('exchanges valid login codes and rejects invalid ones', async () => {
    const dependencies = createDependencies();
    const tokenService = {
      consumeEmailLoginCode: asyncMock(),
      createSessionTokens: asyncMock(),
    };
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
      tokenService as never,
    );

    tokenService.consumeEmailLoginCode.mockRejectedValueOnce(new UnauthorizedException('Недействительный код входа'));
    await expect(service.verifyToken('invalid-code')).rejects.toBeInstanceOf(UnauthorizedException);

    tokenService.consumeEmailLoginCode.mockResolvedValue('user-1');
    tokenService.createSessionTokens.mockResolvedValue({
      userId: 'user-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    dependencies.prisma.user.update.mockResolvedValue({});
    await expect(service.verifyToken('unconfirmed-code')).resolves.toEqual({
      userId: 'user-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(dependencies.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailConfirmedAt: expect.any(Date), lastSignInAt: expect.any(Date) },
    });

    await expect(service.verifyToken('confirmed-code')).resolves.toMatchObject({
      userId: 'user-1',
      accessToken: 'access-token',
    });
  });

  it('sends a passwordless login link for an existing user', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );
    dependencies.prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(service.sendLoginLinkByEmail(' USER@EXAMPLE.COM ')).resolves.toEqual({
      message: 'Ссылка для входа в Runich отправлена на указанную почту',
    });

    expect(dependencies.prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1', type: 'email' }, { expiresIn: '5m' });
    expect(dependencies.email.sendLoginLink).toHaveBeenCalledWith('user@example.com', 'access-token');
  });

  it('does not send a passwordless login link for an unknown user', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );
    dependencies.prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.sendLoginLinkByEmail('missing@example.com')).rejects.toBeInstanceOf(NotFoundException);
    expect(dependencies.email.sendLoginLink).not.toHaveBeenCalled();
    expect(dependencies.jwt.sign).not.toHaveBeenCalled();
  });

  it('refreshes a valid access token and rejects invalid token payloads', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );
    dependencies.jwt.verify.mockReturnValue({ userId: 'user-1' });

    await expect(service.refreshAccessToken('refresh-token')).resolves.toEqual({ accessToken: 'access-token' });
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1', type: 'access' }, { expiresIn: '1d' });

    dependencies.jwt.verify.mockReturnValue({});
    await expect(service.refreshAccessToken('refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
    dependencies.jwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });
    await expect(service.refreshAccessToken('refresh-token')).rejects.toThrow('Недействительный refresh token');
  });

  it('confirms email by code with normalization and handles invalid codes', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.confirmEmailByCode('1234', 'missing@example.com')).rejects.toBeInstanceOf(NotFoundException);

    dependencies.prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', confirmationToken: '1234' });
    await expect(service.confirmEmailByCode('bad', ' USER@EXAMPLE.COM ')).rejects.toBeInstanceOf(BadRequestException);

    dependencies.prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', confirmationToken: '1234' });
    dependencies.prisma.user.update.mockResolvedValue({});
    await expect(service.confirmEmailByCode('1234', ' USER@EXAMPLE.COM ')).resolves.toEqual({
      accessToken: 'access-token',
      userId: 'user-1',
      refreshToken: 'access-token',
    });
    expect(dependencies.prisma.user.findUnique).toHaveBeenLastCalledWith({ where: { email: 'user@example.com' } });
  });

  it('sets the required expiration claims on login and refreshed access tokens', async () => {
    const dependencies = createDependencies();
    const jwtService = new JwtService({ secret: 'test-jwt-secret' });
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      jwtService,
      dependencies.email as unknown as EmailService,
    );
    dependencies.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      encryptedPassword: await (await import('bcrypt')).hash('secret123', 4),
      emailConfirmedAt: new Date(),
    });
    dependencies.prisma.user.update.mockResolvedValue({ id: 'user-1' });

    const loginResult = (await service.login('user@example.com', 'secret123'))!;
    const accessPayload = jwtService.decode<{ iat: number; exp: number }>(loginResult.accessToken);
    const refreshPayload = jwtService.decode<{ iat: number; exp: number }>(loginResult.refreshToken);

    expect(accessPayload.exp - accessPayload.iat).toBe(24 * 60 * 60);
    expect(refreshPayload.exp - refreshPayload.iat).toBe(30 * 24 * 60 * 60);

    const refreshedResult = await service.refreshAccessToken(loginResult.refreshToken);
    const refreshedAccessPayload = jwtService.decode<{ iat: number; exp: number }>(refreshedResult.accessToken);

    expect(refreshedResult).toEqual({ accessToken: expect.any(String) });
    expect(refreshedAccessPayload.exp - refreshedAccessPayload.iat).toBe(24 * 60 * 60);
  });

  it('sends a six-digit password change code and stores it for the user', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    dependencies.email.sendPasswordChangeCode.mockResolvedValue(undefined);
    dependencies.prisma.user.update.mockResolvedValue({});

    await expect(service.getEmailCodeForPassword(' USER@EXAMPLE.COM ')).resolves.toEqual({
      message: 'Код для смены пароля был выслан на указанную почту',
    });

    expect(dependencies.prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
    const [, recoveryCode] = dependencies.email.sendPasswordChangeCode.mock.calls[0] as unknown as [string, number];
    expect(recoveryCode).toBeGreaterThanOrEqual(100000);
    expect(recoveryCode).toBeLessThanOrEqual(999999);
    expect(dependencies.email.sendPasswordChangeCode).toHaveBeenCalledWith('user@example.com', recoveryCode);
    expect(dependencies.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { recoveryToken: `${recoveryCode}`, recoverySentAt: expect.any(Date) },
    });
  });

  it('does not send a password change code for an unknown user', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getEmailCodeForPassword('missing@example.com')).rejects.toBeInstanceOf(NotFoundException);
    expect(dependencies.email.sendPasswordChangeCode).not.toHaveBeenCalled();
    expect(dependencies.prisma.user.update).not.toHaveBeenCalled();
  });

  it('verifies a password change code with email normalization', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', recoveryToken: '123456' });

    await expect(service.verifyPasswordChangeCode('123456', ' USER@EXAMPLE.COM ')).resolves.toEqual({
      message: 'Код для смены пароля подтверждён',
    });
    expect(dependencies.prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
    expect(dependencies.prisma.user.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: { recoveryToken: null },
    });

    dependencies.prisma.user.findUnique.mockResolvedValueOnce({ recoveryToken: '654321' });
    await expect(service.verifyPasswordChangeCode('123456', 'user@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    dependencies.prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.verifyPasswordChangeCode('123456', 'missing@example.com')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('changes the password after the recovery code was verified', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      recoveryToken: null,
      recoverySentAt: new Date(),
    });
    dependencies.prisma.user.update.mockResolvedValue({});

    await expect(service.changePassword('NewPassword1', 'NewPassword1', ' USER@EXAMPLE.COM ')).resolves.toEqual({
      userId: 'user-1',
      accessToken: 'access-token',
      refreshToken: 'access-token',
    });
    expect(dependencies.prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
    expect(dependencies.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        encryptedPassword: expect.any(String),
        recoveryToken: null,
        recoverySentAt: null,
      },
    });

    dependencies.prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      recoveryToken: null,
      recoverySentAt: null,
    });
    await expect(service.changePassword('NewPassword1', 'NewPassword1', 'user@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await expect(service.changePassword('short1A', 'short1B', 'user@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deletes a user and converts database failures from database-backed methods', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );
    dependencies.prisma.user.delete.mockResolvedValue({ id: 'user-1' });
    dependencies.prisma.friend.deleteMany.mockResolvedValue({ count: 1 });
    dependencies.prisma.$transaction.mockImplementation(((
      callback: (transaction: typeof dependencies.prisma) => Promise<unknown>,
    ) => callback(dependencies.prisma)) as never);
    await expect(service.deleteUser('user-1')).resolves.toEqual({ id: 'user-1' });
    expect(dependencies.prisma.friend.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'user-1' }, { friendId: 'user-1' }] },
    });
    expect(dependencies.prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });

    const error = new Error('database unavailable');
    dependencies.prisma.user.findUnique.mockRejectedValue(error);
    await expectInternalServerError(service.signUp('user@example.com', 'secret123'));
    await expectInternalServerError(service.login('user@example.com', 'secret123'));
    await expectInternalServerError(service.sendLoginLinkByEmail('user@example.com'));
    const verifyTokenService = {
      consumeEmailLoginCode: asyncMock().mockResolvedValue('user-1'),
      createSessionTokens: asyncMock(),
    };
    const verifyService = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
      verifyTokenService as never,
    );
    dependencies.prisma.user.update.mockRejectedValue(error);
    await expectInternalServerError(verifyService.verifyToken('token'));
    await expectInternalServerError(service.confirmEmailByCode('1234', 'user@example.com'));
    await expectInternalServerError(service.getEmailCodeForPassword('user@example.com'));
    await expectInternalServerError(service.verifyPasswordChangeCode('123456', 'user@example.com'));
    await expectInternalServerError(service.changePassword('NewPassword1', 'NewPassword1', 'user@example.com'));
    dependencies.prisma.$transaction.mockRejectedValue(error);
    await expectInternalServerError(service.deleteUser('user-1'));
  });
});
