import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { SessionMetadata } from '../types/auth.types';

type AppleIdentity = { subject: string; email?: string; emailVerified: boolean };
type User = { id: string; email: string; appleSubject?: string | null; emailConfirmedAt: Date | null };
type SessionTokens = { userId: string; accessToken: string; refreshToken: string };

const verifyAppleIdentityToken = jest.fn<(token: string, nonce: string) => Promise<AppleIdentity>>();
const isPrismaUniqueConstraintError = jest.fn<(error: unknown) => boolean>(
  (error) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002',
);

jest.unstable_mockModule('../utils/apple-auth.utils', () => ({
  isPrismaUniqueConstraintError,
  verifyAppleIdentityToken,
}));

const { AppleAuthService } = await import('../services/apple-auth.service');

describe('AppleAuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<User | null>>(),
      create: jest.fn<(...args: unknown[]) => Promise<User>>(),
      update: jest.fn<(...args: unknown[]) => Promise<User>>(),
    },
  };
  const tokenService = {
    createSessionTokens: jest.fn<(userId: string, metadata?: SessionMetadata) => Promise<SessionTokens>>(),
  };
  const superuserEmailBootstrapService = { grantIfAllowlisted: jest.fn<(...args: unknown[]) => Promise<void>>() };
  const appleUser: User = {
    id: 'user-1',
    email: 'runner@example.com',
    appleSubject: 'apple-subject',
    emailConfirmedAt: new Date('2026-11-01T00:00:00.000Z'),
  };
  const session: SessionTokens = { userId: 'user-1', accessToken: 'access', refreshToken: 'refresh' };
  let service: InstanceType<typeof AppleAuthService>;

  beforeEach(() => {
    jest.clearAllMocks();
    verifyAppleIdentityToken.mockResolvedValue({
      subject: 'apple-subject',
      email: 'runner@example.com',
      emailVerified: true,
    });
    isPrismaUniqueConstraintError.mockImplementation(
      (error) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002',
    );
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(appleUser);
    prisma.user.update.mockResolvedValue(appleUser);
    tokenService.createSessionTokens.mockResolvedValue(session);
    superuserEmailBootstrapService.grantIfAllowlisted.mockResolvedValue(undefined);
    service = new AppleAuthService(prisma as never, tokenService as never, superuserEmailBootstrapService as never);
  });

  it('logs in by Apple subject even when Apple omits email on a returning sign-in', async () => {
    verifyAppleIdentityToken.mockResolvedValueOnce({ subject: 'apple-subject', emailVerified: false });
    prisma.user.findUnique.mockResolvedValueOnce(appleUser);
    const metadata: SessionMetadata = { deviceId: 'device-1', platform: 'ios' };

    await expect(
      service.loginWithIdentityToken('identity-token', 'nonce', undefined, undefined, metadata),
    ).resolves.toBe(session);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(superuserEmailBootstrapService.grantIfAllowlisted).toHaveBeenCalledWith('user-1', 'runner@example.com');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastSignInAt: expect.any(Date) },
    });
    expect(tokenService.createSessionTokens).toHaveBeenCalledWith('user-1', metadata);
  });

  it('creates a user from a verified Apple relay email and stores first-time names', async () => {
    verifyAppleIdentityToken.mockResolvedValueOnce({
      subject: 'apple-subject',
      email: ' Runner@Example.COM ',
      emailVerified: true,
    });
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await service.loginWithIdentityToken('identity-token', 'nonce', ' Ada ', ' Runner ');

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'runner@example.com',
        authProvider: 'APPLE',
        appleSubject: 'apple-subject',
        emailConfirmedAt: expect.any(Date),
        createdAt: expect.any(Date),
        profile: {
          create: { name: 'Ada', surname: 'Runner', email: 'runner@example.com' },
        },
      },
    });
    expect(tokenService.createSessionTokens).toHaveBeenCalledWith('user-1', {});
  });

  it('links a verified Apple identity to an existing email account and confirms its email', async () => {
    const existingUser: User = { ...appleUser, appleSubject: null, emailConfirmedAt: null };
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(existingUser);

    await service.loginWithIdentityToken('identity-token', 'nonce', undefined, undefined);

    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'user-1' },
      data: { appleSubject: 'apple-subject', emailConfirmedAt: expect.any(Date) },
    });
    expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-1' },
      data: { lastSignInAt: expect.any(Date) },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ['missing email', undefined, true],
    ['unverified email', 'runner@example.com', false],
  ])('rejects account creation when Apple returns an %s', async (_case, email, emailVerified) => {
    verifyAppleIdentityToken.mockResolvedValueOnce({ subject: 'apple-subject', email, emailVerified });

    await expect(
      service.loginWithIdentityToken('identity-token', 'nonce', undefined, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects an email that is already bound to another Apple subject', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...appleUser, appleSubject: 'different-apple-subject' });

    await expect(
      service.loginWithIdentityToken('identity-token', 'nonce', undefined, undefined),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('recovers a concurrent account creation when the Apple subject now exists', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(appleUser);
    prisma.user.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(service.loginWithIdentityToken('identity-token', 'nonce', 'Ada', 'Runner')).resolves.toBe(session);

    expect(isPrismaUniqueConstraintError).toHaveBeenCalledWith({ code: 'P2002' });
    expect(prisma.user.findUnique).toHaveBeenLastCalledWith({ where: { appleSubject: 'apple-subject' } });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastSignInAt: expect.any(Date) },
    });
  });

  it('reports a concurrent registration conflict if the Apple subject is still missing', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.user.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(service.loginWithIdentityToken('identity-token', 'nonce', undefined, undefined)).rejects.toThrow(
      'Аккаунт с этим Apple ID уже создаётся',
    );
  });

  it('propagates non-unique database errors during account creation', async () => {
    const databaseError = new Error('database unavailable');
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.user.create.mockRejectedValueOnce(databaseError);

    await expect(service.loginWithIdentityToken('identity-token', 'nonce', undefined, undefined)).rejects.toBe(
      databaseError,
    );
    expect(isPrismaUniqueConstraintError).toHaveBeenCalledWith(databaseError);
  });
});
