import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EmailService } from 'src/email/email.service';
import { asyncMock, expectInternalServerError, syncMock } from 'src/__tests__/helpers';
import { AuthService } from './auth.service';

function createDependencies() {
  return {
    prisma: {
      users: { findUnique: asyncMock(), create: asyncMock(), update: asyncMock(), delete: asyncMock() },
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
    dependencies.prisma.users.findUnique.mockResolvedValue({ id: 'user-1', email_confirmed_at: null });
    dependencies.prisma.users.update.mockResolvedValue({ id: 'user-1' });
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
    expect(dependencies.prisma.users.update).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      data: { confirmation_sent_at: expect.any(Date), confirmation_token: expect.any(String) },
    });
  });

  it('creates a user and sends a confirmation code on first registration', async () => {
    const dependencies = createDependencies();
    dependencies.prisma.users.findUnique.mockResolvedValue(null);
    dependencies.prisma.users.create.mockResolvedValue({ id: 'user-1' });
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    await expect(service.signUp('user@example.com', 'secret123')).resolves.toEqual({
      message: 'Код подтверждения был выслан на Вашу электронную почту',
    });
    expect(dependencies.prisma.users.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'user@example.com',
        encrypted_password: expect.any(String),
        confirmation_token: expect.any(String),
        confirmation_sent_at: expect.any(Date),
        created_at: expect.any(Date),
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
    dependencies.prisma.users.findUnique.mockResolvedValue(null);
    dependencies.prisma.users.create.mockResolvedValue({ id: 'user-1' });
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

    dependencies.prisma.users.findUnique.mockResolvedValueOnce(null);
    await expect(service.login('missing@example.com', 'secret123')).rejects.toBeInstanceOf(NotFoundException);

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({ encrypted_password: '$2b$10$invalid' });
    await expect(service.login('user@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      encrypted_password: await (await import('bcrypt')).hash('secret123', 4),
    });
    await expect(service.login('user@example.com', 'secret123')).rejects.toBeInstanceOf(UnauthorizedException);

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      encrypted_password: await (await import('bcrypt')).hash('secret123', 4),
      email_confirmed_at: new Date(),
    });
    dependencies.prisma.users.update.mockResolvedValue({ id: 'user-1' });
    await expect(service.login('user@example.com', 'secret123')).resolves.toEqual({
      userId: 'user-1',
      accessToken: 'access-token',
      refreshToken: 'access-token',
    });
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1', type: 'access' }, { expiresIn: '30d' });
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1', type: 'refresh' }, { expiresIn: '180d' });
    expect(dependencies.prisma.users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { last_sign_in_at: expect.any(Date) },
    });
  });

  it('verifies tokens for valid, missing and unconfirmed users', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.jwt.verify.mockReturnValue({});
    await expect(service.verifyToken('token')).rejects.toBeInstanceOf(UnauthorizedException);

    const expiredTokenError = new Error('jwt expired');
    expiredTokenError.name = 'TokenExpiredError';
    dependencies.jwt.verify.mockImplementationOnce(() => {
      throw expiredTokenError;
    });
    await expect(service.verifyToken('expired-token')).rejects.toMatchObject({
      status: 401,
      message: 'Срок действия токена истёк',
    });

    dependencies.jwt.verify.mockReturnValue({ userId: 'missing' });
    dependencies.prisma.users.findUnique.mockResolvedValueOnce(null);
    await expect(service.verifyToken('token')).rejects.toBeInstanceOf(NotFoundException);

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({ id: 'user-1', email_confirmed_at: null });
    dependencies.prisma.users.update.mockResolvedValue({});
    await expect(service.verifyToken('token')).resolves.toEqual({
      userId: 'user-1',
      accessToken: 'access-token',
      refreshToken: 'access-token',
    });
    expect(dependencies.prisma.users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { email_confirmed_at: expect.any(Date) },
    });

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({ id: 'user-1', email_confirmed_at: new Date() });
    await expect(service.verifyToken('token')).resolves.toMatchObject({
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
    dependencies.prisma.users.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(service.sendLoginLinkByEmail(' USER@EXAMPLE.COM ')).resolves.toEqual({
      message: 'Ссылка для входа в Runich отправлена на указанную почту',
    });

    expect(dependencies.prisma.users.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
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
    dependencies.prisma.users.findUnique.mockResolvedValue(null);

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
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1', type: 'access' }, { expiresIn: '30d' });

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

    dependencies.prisma.users.findUnique.mockResolvedValueOnce(null);
    await expect(service.confirmEmailByCode('1234', 'missing@example.com')).rejects.toBeInstanceOf(NotFoundException);

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({ id: 'user-1', confirmation_token: '1234' });
    await expect(service.confirmEmailByCode('bad', ' USER@EXAMPLE.COM ')).rejects.toBeInstanceOf(BadRequestException);

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({ id: 'user-1', confirmation_token: '1234' });
    dependencies.prisma.users.update.mockResolvedValue({});
    await expect(service.confirmEmailByCode('1234', ' USER@EXAMPLE.COM ')).resolves.toEqual({
      accessToken: 'access-token',
      userId: 'user-1',
      refreshToken: 'access-token',
    });
    expect(dependencies.prisma.users.findUnique).toHaveBeenLastCalledWith({ where: { email: 'user@example.com' } });
  });

  it('sets the required expiration claims on login and refreshed access tokens', async () => {
    const dependencies = createDependencies();
    const jwtService = new JwtService({ secret: 'test-jwt-secret' });
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      jwtService,
      dependencies.email as unknown as EmailService,
    );
    dependencies.prisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      encrypted_password: await (await import('bcrypt')).hash('secret123', 4),
      email_confirmed_at: new Date(),
    });
    dependencies.prisma.users.update.mockResolvedValue({ id: 'user-1' });

    const loginResult = (await service.login('user@example.com', 'secret123'))!;
    const accessPayload = jwtService.decode<{ iat: number; exp: number }>(loginResult.accessToken);
    const refreshPayload = jwtService.decode<{ iat: number; exp: number }>(loginResult.refreshToken);

    expect(accessPayload.exp - accessPayload.iat).toBe(30 * 24 * 60 * 60);
    expect(refreshPayload.exp - refreshPayload.iat).toBe(180 * 24 * 60 * 60);

    const refreshedResult = await service.refreshAccessToken(loginResult.refreshToken);
    const refreshedAccessPayload = jwtService.decode<{ iat: number; exp: number }>(refreshedResult.accessToken);

    expect(refreshedResult).toEqual({ accessToken: expect.any(String) });
    expect(refreshedAccessPayload.exp - refreshedAccessPayload.iat).toBe(30 * 24 * 60 * 60);
  });

  it('sends a six-digit password change code and stores it for the user', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.prisma.users.findUnique.mockResolvedValue({ id: 'user-1' });
    dependencies.email.sendPasswordChangeCode.mockResolvedValue(undefined);
    dependencies.prisma.users.update.mockResolvedValue({});

    await expect(service.getEmailCodeForPassword(' USER@EXAMPLE.COM ')).resolves.toEqual({
      message: 'Код для смены email был выслан на указанную почту',
    });

    expect(dependencies.prisma.users.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
    const [, recoveryCode] = dependencies.email.sendPasswordChangeCode.mock.calls[0] as unknown as [string, number];
    expect(recoveryCode).toBeGreaterThanOrEqual(100000);
    expect(recoveryCode).toBeLessThanOrEqual(999999);
    expect(dependencies.email.sendPasswordChangeCode).toHaveBeenCalledWith('user@example.com', recoveryCode);
    expect(dependencies.prisma.users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { recovery_token: `${recoveryCode}`, recovery_sent_at: expect.any(Date) },
    });
  });

  it('does not send a password change code for an unknown user', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.prisma.users.findUnique.mockResolvedValue(null);

    await expect(service.getEmailCodeForPassword('missing@example.com')).rejects.toBeInstanceOf(NotFoundException);
    expect(dependencies.email.sendPasswordChangeCode).not.toHaveBeenCalled();
    expect(dependencies.prisma.users.update).not.toHaveBeenCalled();
  });

  it('verifies a password change code with email normalization', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.prisma.users.findUnique.mockResolvedValue({ id: 'user-1', recovery_token: '123456' });

    await expect(service.verifyPasswordChangeCode('123456', ' USER@EXAMPLE.COM ')).resolves.toEqual({
      message: 'Код для смены пароля подтверждён',
    });
    expect(dependencies.prisma.users.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
    expect(dependencies.prisma.users.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: { recovery_token: null },
    });

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({ recovery_token: '654321' });
    await expect(service.verifyPasswordChangeCode('123456', 'user@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    dependencies.prisma.users.findUnique.mockResolvedValueOnce(null);
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

    dependencies.prisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      recovery_token: null,
      recovery_sent_at: new Date(),
    });
    dependencies.prisma.users.update.mockResolvedValue({});

    await expect(service.changePassword('NewPassword1', 'NewPassword1', ' USER@EXAMPLE.COM ')).resolves.toEqual({
      userId: 'user-1',
      accessToken: 'access-token',
      refreshToken: 'access-token',
    });
    expect(dependencies.prisma.users.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
    expect(dependencies.prisma.users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        encrypted_password: expect.any(String),
        recovery_token: null,
        recovery_sent_at: null,
      },
    });

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      recovery_token: null,
      recovery_sent_at: null,
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
    dependencies.prisma.users.delete.mockResolvedValue({ id: 'user-1' });
    dependencies.prisma.friend.deleteMany.mockResolvedValue({ count: 1 });
    dependencies.prisma.$transaction.mockImplementation(((
      callback: (transaction: typeof dependencies.prisma) => Promise<unknown>,
    ) => callback(dependencies.prisma)) as never);
    await expect(service.deleteUser('user-1')).resolves.toEqual({ id: 'user-1' });
    expect(dependencies.prisma.friend.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ user_id: 'user-1' }, { friendId: 'user-1' }] },
    });
    expect(dependencies.prisma.users.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });

    const error = new Error('database unavailable');
    dependencies.prisma.users.findUnique.mockRejectedValue(error);
    await expectInternalServerError(service.signUp('user@example.com', 'secret123'));
    await expectInternalServerError(service.login('user@example.com', 'secret123'));
    await expectInternalServerError(service.sendLoginLinkByEmail('user@example.com'));
    dependencies.jwt.verify.mockReturnValue({ userId: 'user-1' });
    await expectInternalServerError(service.verifyToken('token'));
    await expectInternalServerError(service.confirmEmailByCode('1234', 'user@example.com'));
    await expectInternalServerError(service.getEmailCodeForPassword('user@example.com'));
    await expectInternalServerError(service.verifyPasswordChangeCode('123456', 'user@example.com'));
    await expectInternalServerError(service.changePassword('NewPassword1', 'NewPassword1', 'user@example.com'));
    dependencies.prisma.$transaction.mockRejectedValue(error);
    await expectInternalServerError(service.deleteUser('user-1'));
  });
});
