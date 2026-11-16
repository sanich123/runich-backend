import { ConflictException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { generateKeyPairSync } from 'node:crypto';
import type { SessionMetadata } from '../types/auth.types';

type AppleIdentity = { subject: string; clientId: string; email?: string; emailVerified: boolean };
type User = {
  id: string;
  email: string;
  appleSubject?: string | null;
  appleRefreshTokenEncrypted?: string | null;
  emailConfirmedAt: Date | null;
};
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
  const privateKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  const originalAppleEnvironment = {
    APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
    APPLE_KEY_ID: process.env.APPLE_KEY_ID,
    APPLE_PRIVATE_KEY_BASE64: process.env.APPLE_PRIVATE_KEY_BASE64,
    APPLE_TOKEN_ENCRYPTION_KEY: process.env.APPLE_TOKEN_ENCRYPTION_KEY,
  };
  let service: InstanceType<typeof AppleAuthService>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APPLE_TEAM_ID = 'test-team';
    process.env.APPLE_KEY_ID = 'test-key';
    process.env.APPLE_PRIVATE_KEY_BASE64 = Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' })).toString(
      'base64',
    );
    process.env.APPLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ refresh_token: 'apple-refresh-token' }), { status: 200 }));
    verifyAppleIdentityToken.mockResolvedValue({
      subject: 'apple-subject',
      clientId: 'com.sanich123.runich',
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

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of Object.entries(originalAppleEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function storeAppleGrant(): Promise<string> {
    prisma.user.findUnique.mockResolvedValueOnce(appleUser);
    await service.loginWithIdentityToken('identity-token', 'authorization-code', 'nonce', undefined, undefined);

    const updateCall = prisma.user.update.mock.calls.at(-1)?.[0] as {
      data: { appleRefreshTokenEncrypted: string };
    };
    return updateCall.data.appleRefreshTokenEncrypted;
  }

  it('logs in by Apple subject even when Apple omits email on a returning sign-in', async () => {
    verifyAppleIdentityToken.mockResolvedValueOnce({
      subject: 'apple-subject',
      clientId: 'com.sanich123.runich',
      emailVerified: false,
    });
    prisma.user.findUnique.mockResolvedValueOnce(appleUser);
    const metadata: SessionMetadata = { deviceId: 'device-1', platform: 'ios' };

    await expect(
      service.loginWithIdentityToken('identity-token', 'authorization-code', 'nonce', undefined, undefined, metadata),
    ).resolves.toBe(session);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(superuserEmailBootstrapService.grantIfAllowlisted).toHaveBeenCalledWith('user-1', 'runner@example.com');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        appleRefreshTokenEncrypted: expect.stringMatching(/^v1\./),
        lastSignInAt: expect.any(Date),
      },
    });
    expect(tokenService.createSessionTokens).toHaveBeenCalledWith('user-1', metadata);
  });

  it('creates a user from a verified Apple relay email and stores first-time names', async () => {
    verifyAppleIdentityToken.mockResolvedValueOnce({
      subject: 'apple-subject',
      clientId: 'com.sanich123.runich',
      email: ' Runner@Example.COM ',
      emailVerified: true,
    });
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await service.loginWithIdentityToken('identity-token', 'authorization-code', 'nonce', ' Ada ', ' Runner ');

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

    await service.loginWithIdentityToken('identity-token', 'authorization-code', 'nonce', undefined, undefined);

    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'user-1' },
      data: { appleSubject: 'apple-subject', emailConfirmedAt: expect.any(Date) },
    });
    expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-1' },
      data: {
        appleRefreshTokenEncrypted: expect.stringMatching(/^v1\./),
        lastSignInAt: expect.any(Date),
      },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ['missing email', undefined, true],
    ['unverified email', 'runner@example.com', false],
  ])('rejects account creation when Apple returns an %s', async (_case, email, emailVerified) => {
    verifyAppleIdentityToken.mockResolvedValueOnce({
      subject: 'apple-subject',
      clientId: 'com.sanich123.runich',
      email,
      emailVerified,
    });

    await expect(
      service.loginWithIdentityToken('identity-token', 'authorization-code', 'nonce', undefined, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects an email that is already bound to another Apple subject', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...appleUser, appleSubject: 'different-apple-subject' });

    await expect(
      service.loginWithIdentityToken('identity-token', 'authorization-code', 'nonce', undefined, undefined),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('recovers a concurrent account creation when the Apple subject now exists', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(appleUser);
    prisma.user.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      service.loginWithIdentityToken('identity-token', 'authorization-code', 'nonce', 'Ada', 'Runner'),
    ).resolves.toBe(session);

    expect(isPrismaUniqueConstraintError).toHaveBeenCalledWith({ code: 'P2002' });
    expect(prisma.user.findUnique).toHaveBeenLastCalledWith({ where: { appleSubject: 'apple-subject' } });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        appleRefreshTokenEncrypted: expect.stringMatching(/^v1\./),
        lastSignInAt: expect.any(Date),
      },
    });
  });

  it('reports a concurrent registration conflict if the Apple subject is still missing', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.user.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      service.loginWithIdentityToken('identity-token', 'authorization-code', 'nonce', undefined, undefined),
    ).rejects.toThrow('Аккаунт с этим Apple ID уже создаётся');
  });

  it('propagates non-unique database errors during account creation', async () => {
    const databaseError = new Error('database unavailable');
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.user.create.mockRejectedValueOnce(databaseError);

    await expect(
      service.loginWithIdentityToken('identity-token', 'authorization-code', 'nonce', undefined, undefined),
    ).rejects.toBe(databaseError);
    expect(isPrismaUniqueConstraintError).toHaveBeenCalledWith(databaseError);
  });

  it('skips Apple revocation when no refresh token is stored', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ ...appleUser, appleRefreshTokenEncrypted: null });

    await expect(service.revokeUserToken('user-1')).resolves.toBeUndefined();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('revokes the stored Apple refresh token', async () => {
    const encryptedGrant = await storeAppleGrant();
    prisma.user.findUnique.mockResolvedValueOnce({ ...appleUser, appleRefreshTokenEncrypted: encryptedGrant });

    await expect(service.revokeUserToken('user-1')).resolves.toBeUndefined();

    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      'https://appleid.apple.com/auth/revoke',
      expect.objectContaining({ method: 'POST', body: expect.any(URLSearchParams) }),
    );
  });

  it('treats an already revoked Apple refresh token as success', async () => {
    const encryptedGrant = await storeAppleGrant();
    prisma.user.findUnique.mockResolvedValueOnce({ ...appleUser, appleRefreshTokenEncrypted: encryptedGrant });
    jest
      .mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_token' }), { status: 400 }));

    await expect(service.revokeUserToken('user-1')).resolves.toBeUndefined();
  });

  it('keeps the account deletion retryable when Apple refuses token revocation', async () => {
    const encryptedGrant = await storeAppleGrant();
    prisma.user.findUnique.mockResolvedValueOnce({ ...appleUser, appleRefreshTokenEncrypted: encryptedGrant });
    jest
      .mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }));

    await expect(service.revokeUserToken('user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
