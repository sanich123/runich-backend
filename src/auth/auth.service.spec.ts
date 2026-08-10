import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EmailService } from 'src/email/email.service';
import { asyncMock, expectInternalServerError, syncMock } from 'src/__tests__/helpers';
import { AuthService } from './auth.service';

function createDependencies() {
  return {
    prisma: { users: { findUnique: asyncMock(), create: asyncMock(), update: asyncMock(), delete: asyncMock() } },
    jwt: { sign: syncMock().mockReturnValue('access-token'), verify: syncMock() },
    email: { sendConfirmationCode: asyncMock(), sendResetPasswordLink: asyncMock() },
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

    await expect(service.signUp('user@example.com', 'secret123')).resolves.toEqual({ id: 'user-1' });
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1' });
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
      }),
    });
    expect(dependencies.email.sendConfirmationCode).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(Number),
      'access-token',
    );
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
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1' }, { expiresIn: '1d' });
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1' }, { expiresIn: '180d' });
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

    dependencies.jwt.verify.mockReturnValue({ userId: 'missing' });
    dependencies.prisma.users.findUnique.mockResolvedValueOnce(null);
    await expect(service.verifyToken('token')).rejects.toBeInstanceOf(NotFoundException);

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({ id: 'user-1', email_confirmed_at: null });
    dependencies.prisma.users.update.mockResolvedValue({});
    await expect(service.verifyToken('token')).resolves.toEqual({
      userId: 'user-1',
      accessToken: 'access-token',
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

  it('refreshes a valid access token and rejects invalid token payloads', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );
    dependencies.jwt.verify.mockReturnValue({ userId: 'user-1' });

    await expect(service.refreshAccessToken('refresh-token')).resolves.toEqual({ accessToken: 'access-token' });
    expect(dependencies.jwt.sign).toHaveBeenCalledWith({ userId: 'user-1' }, { expiresIn: '1d' });

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

    expect(accessPayload.exp - accessPayload.iat).toBe(86400);
    expect(refreshPayload.exp - refreshPayload.iat).toBe(180 * 24 * 60 * 60);

    const refreshedResult = await service.refreshAccessToken(loginResult.refreshToken);
    const refreshedAccessPayload = jwtService.decode<{ iat: number; exp: number }>(refreshedResult.accessToken);

    expect(refreshedResult).toEqual({ accessToken: expect.any(String) });
    expect(refreshedAccessPayload.exp - refreshedAccessPayload.iat).toBe(86400);
  });

  it('sends a reset link only to a confirmed user', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );

    dependencies.prisma.users.findUnique.mockResolvedValueOnce(null);
    await expect(service.authInFromEmailLink('missing@example.com')).rejects.toBeInstanceOf(NotFoundException);

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({ id: 'user-1', email_confirmed_at: null });
    await expect(service.authInFromEmailLink('user@example.com')).rejects.toBeInstanceOf(NotFoundException);

    dependencies.prisma.users.findUnique.mockResolvedValueOnce({ id: 'user-1', email_confirmed_at: new Date() });
    await expect(service.authInFromEmailLink(' USER@EXAMPLE.COM ')).resolves.toEqual({
      message: 'Код подтверждения был выслан на Вашу электронную почту',
    });
    expect(dependencies.email.sendResetPasswordLink).toHaveBeenCalledWith(' USER@EXAMPLE.COM ', 'access-token');
  });

  it('deletes a user and converts database failures from database-backed methods', async () => {
    const dependencies = createDependencies();
    const service = new AuthService(
      dependencies.prisma as unknown as PrismaService,
      dependencies.jwt as unknown as JwtService,
      dependencies.email as unknown as EmailService,
    );
    dependencies.prisma.users.delete.mockResolvedValue({ id: 'user-1' });
    await expect(service.deleteUser('user-1')).resolves.toEqual({ id: 'user-1' });

    const error = new Error('database unavailable');
    dependencies.prisma.users.findUnique.mockRejectedValue(error);
    await expectInternalServerError(service.signUp('user@example.com', 'secret123'));
    await expectInternalServerError(service.login('user@example.com', 'secret123'));
    dependencies.jwt.verify.mockReturnValue({ userId: 'user-1' });
    await expectInternalServerError(service.verifyToken('token'));
    await expectInternalServerError(service.confirmEmailByCode('1234', 'user@example.com'));
    await expectInternalServerError(service.authInFromEmailLink('user@example.com'));
    dependencies.prisma.users.delete.mockRejectedValue(error);
    await expectInternalServerError(service.deleteUser('user-1'));
  });
});
