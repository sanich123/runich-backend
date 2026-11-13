import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { APPLE_APP_BUNDLE_IDS, APPLE_ID_TOKEN_ISSUER, APPLE_JWKS_URL } from '../constants/apple-auth.constants';

const appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL), { timeoutDuration: 5000 });

export interface VerifiedAppleIdentity {
  subject: string;
  clientId: string;
  email?: string;
  emailVerified: boolean;
}

export async function verifyAppleIdentityToken(identityToken: string, nonce: string): Promise<VerifiedAppleIdentity> {
  try {
    const { payload, protectedHeader } = await jwtVerify(identityToken, appleJwks, {
      algorithms: ['RS256'],
      audience: [...APPLE_APP_BUNDLE_IDS],
      clockTolerance: 30,
      issuer: APPLE_ID_TOKEN_ISSUER,
      maxTokenAge: '10m',
    });
    const audiences = Array.isArray(payload.aud) ? payload.aud : typeof payload.aud === 'string' ? [payload.aud] : [];
    const clientId = audiences.find((audience) => APPLE_APP_BUNDLE_IDS.some((bundleId) => bundleId === audience));
    if (protectedHeader.alg !== 'RS256' || !payload.sub || !clientId || payload.nonce !== nonce) {
      throw new UnauthorizedException('Недействительный ответ Apple');
    }

    return {
      subject: payload.sub,
      clientId,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    };
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    if (error instanceof errors.JOSEError) throw new UnauthorizedException('Недействительный токен Apple');
    throw new ServiceUnavailableException('Не удалось проверить токен Apple');
  }
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
