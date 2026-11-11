import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';

type VerificationResult = {
  payload: { sub?: string; nonce?: string; email?: unknown; email_verified?: unknown };
  protectedHeader: { alg?: string };
};

class JoseError extends Error {}

const jwks = jest.fn();
const createRemoteJWKSet = jest.fn(() => jwks);
const jwtVerify = jest.fn<(...args: unknown[]) => Promise<VerificationResult>>();

jest.unstable_mockModule('jose', () => ({
  createRemoteJWKSet,
  errors: { JOSEError: JoseError },
  jwtVerify,
}));

const { isPrismaUniqueConstraintError, verifyAppleIdentityToken } = await import('../utils/apple-auth.utils');

describe('Apple authentication token helpers', () => {
  beforeEach(() => {
    jwtVerify.mockClear();
    jwtVerify.mockResolvedValue({
      payload: { sub: 'apple-subject', nonce: 'request-nonce', email: 'runner@example.com', email_verified: true },
      protectedHeader: { alg: 'RS256' },
    });
  });

  it('verifies the Apple issuer, audience, signature algorithm, age and request nonce', async () => {
    await expect(verifyAppleIdentityToken('signed-token', 'request-nonce')).resolves.toEqual({
      subject: 'apple-subject',
      email: 'runner@example.com',
      emailVerified: true,
    });
    expect(createRemoteJWKSet).toHaveBeenCalledWith(new URL('https://appleid.apple.com/auth/keys'), {
      timeoutDuration: 5000,
    });
    expect(jwtVerify).toHaveBeenCalledWith(
      'signed-token',
      jwks,
      expect.objectContaining({
        algorithms: ['RS256'],
        audience: ['com.sanich123.runich', 'com.sanich123.runich.dev'],
        issuer: 'https://appleid.apple.com',
        maxTokenAge: '10m',
      }),
    );
  });

  it('treats Apple string verification claims as verified and ignores non-string emails', async () => {
    jwtVerify.mockResolvedValueOnce({
      payload: { sub: 'apple-subject', nonce: 'request-nonce', email: 42, email_verified: 'true' },
      protectedHeader: { alg: 'RS256' },
    });

    await expect(verifyAppleIdentityToken('signed-token', 'request-nonce')).resolves.toEqual({
      subject: 'apple-subject',
      email: undefined,
      emailVerified: true,
    });

    jwtVerify.mockResolvedValueOnce({
      payload: { sub: 'apple-subject', nonce: 'request-nonce', email: 'runner@example.com', email_verified: false },
      protectedHeader: { alg: 'RS256' },
    });
    await expect(verifyAppleIdentityToken('signed-token', 'request-nonce')).resolves.toMatchObject({
      emailVerified: false,
    });
  });

  it.each([
    ['missing subject', { sub: undefined, nonce: 'request-nonce' }, 'RS256'],
    ['wrong nonce', { sub: 'apple-subject', nonce: 'different-nonce' }, 'RS256'],
    ['wrong signing algorithm', { sub: 'apple-subject', nonce: 'request-nonce' }, 'HS256'],
  ])('rejects a token with %s', async (_case, payload, alg) => {
    jwtVerify.mockResolvedValueOnce({ payload, protectedHeader: { alg } });

    await expect(verifyAppleIdentityToken('signed-token', 'request-nonce')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('translates rejected JOSE tokens into unauthorized responses', async () => {
    jwtVerify.mockRejectedValueOnce(new JoseError('invalid signature'));

    await expect(verifyAppleIdentityToken('bad-token', 'request-nonce')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reports Apple key-service failures as temporary service errors', async () => {
    jwtVerify.mockRejectedValueOnce(new Error('Apple key service unavailable'));

    await expect(verifyAppleIdentityToken('signed-token', 'request-nonce')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('recognizes Prisma unique constraint errors without treating other values as duplicates', () => {
    expect(isPrismaUniqueConstraintError({ code: 'P2002' })).toBe(true);
    expect(isPrismaUniqueConstraintError({ code: 'P2025' })).toBe(false);
    expect(isPrismaUniqueConstraintError(null)).toBe(false);
    expect(isPrismaUniqueConstraintError('P2002')).toBe(false);
  });
});
