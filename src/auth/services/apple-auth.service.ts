import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { SessionMetadata } from '../types/auth.types';
import { normalizeEmail } from '../utils/russian-email';
import { isPrismaUniqueConstraintError, verifyAppleIdentityToken } from '../utils/apple-auth.utils';
import {
  APPLE_APP_BUNDLE_IDS,
  APPLE_ID_TOKEN_ISSUER,
  APPLE_TOKEN_ENCRYPTION_VERSION,
  APPLE_TOKEN_REQUEST_TIMEOUT_MS,
  APPLE_TOKEN_REVOCATION_URL,
  APPLE_TOKEN_URL,
} from '../constants/apple-auth.constants';
import type { EncryptedAppleGrant } from '../types/apple-auth.types';
import { AuthTokenService } from './auth-token.service';
import { SuperuserEmailBootstrapService } from './superuser-email-bootstrap.service';

@Injectable()
export class AppleAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthTokenService) private readonly tokenService: AuthTokenService,
    @Inject(SuperuserEmailBootstrapService)
    private readonly superuserEmailBootstrapService: SuperuserEmailBootstrapService,
  ) {}

  async loginWithIdentityToken(
    identityToken: string,
    authorizationCode: string,
    nonce: string,
    givenName: string | undefined,
    familyName: string | undefined,
    metadata: SessionMetadata = {},
  ) {
    const identity = await verifyAppleIdentityToken(identityToken, nonce);
    const appleRefreshTokenEncrypted = await this.exchangeAuthorizationCode(authorizationCode, identity.clientId);
    let user = await this.prisma.user.findUnique({ where: { appleSubject: identity.subject } });

    if (!user) {
      if (!identity.email || !identity.emailVerified) {
        throw new UnauthorizedException('Apple не передал подтверждённый email для создания аккаунта');
      }

      const email = normalizeEmail(identity.email);
      user = await this.prisma.user.findUnique({ where: { email } });
      if (user) {
        if (user.appleSubject && user.appleSubject !== identity.subject) {
          throw new ConflictException('Этот email уже связан с другим Apple ID');
        }
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { appleSubject: identity.subject, emailConfirmedAt: user.emailConfirmedAt ?? new Date() },
        });
      } else {
        try {
          user = await this.prisma.user.create({
            data: {
              email,
              authProvider: 'APPLE',
              appleSubject: identity.subject,
              emailConfirmedAt: new Date(),
              createdAt: new Date(),
              profile: {
                create: {
                  name: givenName?.trim() || undefined,
                  surname: familyName?.trim() || undefined,
                  email,
                },
              },
            },
          });
        } catch (error) {
          if (!isPrismaUniqueConstraintError(error)) throw error;
          user = await this.prisma.user.findUnique({ where: { appleSubject: identity.subject } });
          if (!user) throw new ConflictException('Аккаунт с этим Apple ID уже создаётся');
        }
      }
    }

    if (!user) throw new ConflictException('Не удалось получить аккаунт Apple после авторизации');

    await this.superuserEmailBootstrapService.grantIfAllowlisted(user.id, user.email);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { appleRefreshTokenEncrypted, lastSignInAt: new Date() },
    });
    return this.tokenService.createSessionTokens(user.id, metadata);
  }

  async revokeUserToken(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { appleRefreshTokenEncrypted: true },
    });
    if (!user?.appleRefreshTokenEncrypted) return;

    const { clientId, refreshToken } = this.decryptAppleGrant(user.appleRefreshTokenEncrypted);
    const clientSecret = await this.createClientSecret(clientId);
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(APPLE_TOKEN_REVOCATION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          token: refreshToken,
          token_type_hint: 'refresh_token',
        }),
        signal: AbortSignal.timeout(APPLE_TOKEN_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException('Не удалось отозвать доступ Apple. Попробуйте удалить аккаунт ещё раз.');
    }

    if (response.ok) return;

    let providerError: { error?: unknown } | null = null;
    try {
      providerError = (await response.json()) as { error?: unknown };
    } catch {
      // Apple may return an empty response body for token errors.
    }
    if (providerError?.error === 'invalid_token') return;
    throw new ServiceUnavailableException('Не удалось отозвать доступ Apple. Попробуйте удалить аккаунт ещё раз.');
  }

  private async exchangeAuthorizationCode(authorizationCode: string, clientId: string): Promise<string> {
    const encryptionKey = this.getTokenEncryptionKey();
    const clientSecret = await this.createClientSecret(clientId);
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(APPLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: authorizationCode,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(APPLE_TOKEN_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException('Не удалось проверить код авторизации Apple.');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException('Не удалось проверить код авторизации Apple.');
    }
    let tokenResponse: { refresh_token?: unknown };
    try {
      tokenResponse = (await response.json()) as { refresh_token?: unknown };
    } catch {
      throw new ServiceUnavailableException('Apple вернул неполный ответ авторизации.');
    }
    if (typeof tokenResponse.refresh_token !== 'string' || !tokenResponse.refresh_token) {
      throw new ServiceUnavailableException('Apple не вернул токен для последующего отзыва.');
    }
    return this.encryptAppleGrant({ clientId, refreshToken: tokenResponse.refresh_token }, encryptionKey);
  }

  private async createClientSecret(clientId: string): Promise<string> {
    const teamId = process.env.APPLE_TEAM_ID?.trim();
    const keyId = process.env.APPLE_KEY_ID?.trim();
    const privateKeyBase64 = process.env.APPLE_PRIVATE_KEY_BASE64?.trim();
    if (!teamId || !keyId || !privateKeyBase64) {
      throw new ServiceUnavailableException('Не настроен обмен токенов Apple.');
    }

    try {
      const privateKey = await importPKCS8(Buffer.from(privateKeyBase64, 'base64').toString('utf8'), 'ES256');
      return await new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
        .setIssuer(teamId)
        .setSubject(clientId)
        .setAudience(APPLE_ID_TOKEN_ISSUER)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    } catch {
      throw new ServiceUnavailableException('Не удалось создать учетные данные Apple.');
    }
  }

  private getTokenEncryptionKey(): Buffer {
    const encodedKey = process.env.APPLE_TOKEN_ENCRYPTION_KEY?.trim();
    const key = encodedKey && /^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey) ? Buffer.from(encodedKey, 'base64') : null;
    if (
      !encodedKey ||
      !key ||
      key.length !== 32 ||
      key.toString('base64').replace(/=+$/, '') !== encodedKey.replace(/=+$/, '')
    ) {
      throw new ServiceUnavailableException('Не настроено безопасное хранение токенов Apple.');
    }
    return key;
  }

  private encryptAppleGrant(grant: EncryptedAppleGrant, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(grant), 'utf8'), cipher.final()]);
    return [
      APPLE_TOKEN_ENCRYPTION_VERSION,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  private decryptAppleGrant(encryptedGrant: string): EncryptedAppleGrant {
    try {
      const [version, encodedIv, encodedTag, encodedValue, ...extra] = encryptedGrant.split('.');
      if (version !== APPLE_TOKEN_ENCRYPTION_VERSION || !encodedIv || !encodedTag || !encodedValue || extra.length) {
        throw new Error();
      }
      const key = this.getTokenEncryptionKey();
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64url'));
      decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encodedValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      const grant = JSON.parse(decrypted) as unknown;
      if (
        typeof grant !== 'object' ||
        grant === null ||
        !('clientId' in grant) ||
        typeof grant.clientId !== 'string' ||
        !APPLE_APP_BUNDLE_IDS.some((bundleId) => bundleId === grant.clientId) ||
        !('refreshToken' in grant) ||
        typeof grant.refreshToken !== 'string' ||
        !grant.refreshToken
      ) {
        throw new Error();
      }
      return { clientId: grant.clientId, refreshToken: grant.refreshToken };
    } catch {
      throw new ServiceUnavailableException('Не удалось восстановить сохранённый токен Apple.');
    }
  }
}
