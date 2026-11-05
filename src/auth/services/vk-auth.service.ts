import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { Response } from 'express';
import { AuthTokenService } from './auth-token.service';
import { getAuthFrontendRedirectUri } from 'src/common/config/environment';
import { VK_AUTHORIZE_URL, VK_TOKEN_URL, VK_USER_INFO_URL } from '../constants/auth.constants';
import type { VkState } from '../types/auth.types';
import { normalizeEmail } from '../utils/russian-email';
import { SuperuserEmailBootstrapService } from './superuser-email-bootstrap.service';
import type { SessionMetadata } from '../types/auth.types';

@Injectable()
export class VkAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(AuthTokenService) private readonly tokenService: AuthTokenService,
    @Inject(SuperuserEmailBootstrapService)
    private readonly superuserEmailBootstrapService = new SuperuserEmailBootstrapService(prisma),
  ) {}

  async loginWithNativeCode(code: string, deviceId: string, codeVerifier: string, metadata: SessionMetadata = {}) {
    if (
      !code ||
      code.length > 4096 ||
      !deviceId ||
      deviceId.length > 256 ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)
    ) {
      throw new UnauthorizedException('Недействительные параметры авторизации VK');
    }

    const clientId = process.env.VK_NATIVE_CLIENT_ID || '54878048';
    const redirectUri = process.env.VK_NATIVE_REDIRECT_URI || `vk${clientId}://vk.ru/blank.html`;
    const tokenResponse = await fetch(VK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        device_id: deviceId,
        redirect_uri: redirectUri,
        code,
        code_verifier: codeVerifier,
      }),
    });
    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      user_id?: string | number;
      email?: string;
      error?: string;
    };
    if (!tokenResponse.ok || !tokenPayload.access_token || !tokenPayload.user_id) {
      throw new UnauthorizedException('Не удалось проверить авторизацию VK');
    }

    const profileResponse = await fetch(VK_USER_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: tokenPayload.access_token, client_id: clientId }),
    });
    const profilePayload = (await profileResponse.json()) as {
      user?: {
        user_id?: string;
        first_name?: string;
        last_name?: string;
        avatar?: string;
        city?: string;
        email?: string;
      };
    };
    if (!profileResponse.ok || !profilePayload.user) {
      throw new UnauthorizedException('Не удалось получить профиль VK');
    }

    const profile = profilePayload.user;
    const profileId = profile.user_id ?? String(tokenPayload.user_id);
    const email = normalizeEmail(tokenPayload.email?.trim() || profile.email?.trim() || `vk_${profileId}@vk.local`);
    let user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, emailConfirmedAt: true } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          authProvider: 'VK',
          emailConfirmedAt: new Date(),
          createdAt: new Date(),
          profile: {
            create: {
              name: profile.first_name,
              surname: profile.last_name,
              city: profile.city,
              profilePhoto: profile.avatar,
              email,
            },
          },
        },
      });
    } else if (!user.emailConfirmedAt) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { emailConfirmedAt: new Date() } });
    }

    await this.superuserEmailBootstrapService.grantIfAllowlisted(user.id, email);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastSignInAt: new Date() } });
    return this.tokenService.createSessionTokens(user.id, metadata);
  }

  start(response: Response) {
    const clientId = process.env.VK_CLIENT_ID!;
    const redirectUri = process.env.VK_REDIRECT_URI!;

    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    // VK ID removes dots from the state value returned to the callback. Keep
    // the signed state opaque and URL-safe so its JWT separators survive the
    // provider round trip.
    const signedState = this.jwtService.sign({ codeVerifier } satisfies VkState, { expiresIn: '10m' });
    const state = Buffer.from(signedState).toString('base64url');
    const url = new URL(VK_AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'vkid.personal_info email');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return response.redirect(url.toString());
  }

  async callback(code: string, state: string, error: string | undefined, response: Response, deviceId?: string) {
    const frontendUrl = getAuthFrontendRedirectUri();
    if (error || !code || !state) {
      return this.redirectError(response, frontendUrl, error || 'missing_code');
    }

    let statePayload: VkState;
    try {
      const signedState = Buffer.from(state, 'base64url').toString('utf8');
      statePayload = this.jwtService.verify<VkState>(signedState);
    } catch {
      return this.redirectError(response, frontendUrl, 'Недействительный state VK', 'invalid_state');
    }
    if (!statePayload.codeVerifier)
      return this.redirectError(response, frontendUrl, 'VK не вернул code verifier', 'missing_verifier');

    if (!deviceId) return this.redirectError(response, frontendUrl, 'VK не вернул device_id', 'missing_device_id');

    const clientId = process.env.VK_CLIENT_ID!;
    const redirectUri = process.env.VK_REDIRECT_URI!;

    try {
      const tokenResponse = await fetch(VK_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'authorization_code',
          device_id: deviceId,
          redirect_uri: redirectUri,
          code,
          code_verifier: statePayload.codeVerifier,
        }),
      });
      const tokenPayload = (await tokenResponse.json()) as {
        access_token?: string;
        user_id?: string | number;
        email?: string;
        error?: string;
        error_description?: string;
      };
      if (!tokenResponse.ok) {
        return this.redirectError(
          response,
          frontendUrl,
          tokenPayload.error_description ?? 'VK не выдал токен',
          tokenPayload.error ?? 'token_exchange_failed',
        );
      }
      if (!tokenPayload.access_token || !tokenPayload.user_id) {
        return this.redirectError(response, frontendUrl, 'VK не вернул данные токена', 'invalid_token_response');
      }
      const accessToken = tokenPayload.access_token;

      const profileResponse = await fetch(VK_USER_INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: accessToken, client_id: clientId }),
      });
      const profilePayload = (await profileResponse.json()) as {
        user?: { user_id?: string; first_name?: string; last_name?: string; avatar?: string; city?: string };
        error?: string;
        error_description?: string;
      };
      if (!profileResponse.ok || !profilePayload.user) {
        return this.redirectError(
          response,
          frontendUrl,
          profilePayload.error_description ?? 'VK не вернул профиль пользователя',
          profilePayload.error ?? 'profile_failed',
        );
      }
      const profile = profilePayload.user;

      const profileId = profile.user_id ?? String(tokenPayload.user_id);
      const email = normalizeEmail(tokenPayload.email?.trim() || `vk_${profileId}@vk.local`);
      let user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, emailConfirmedAt: true } });
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email,
            authProvider: 'VK',
            emailConfirmedAt: new Date(),
            createdAt: new Date(),
            profile: {
              create: {
                name: profile.first_name,
                surname: profile.last_name,
                city: profile.city,
                profilePhoto: profile.avatar,
                email,
              },
            },
          },
        });
      } else if (!user.emailConfirmedAt) {
        user = await this.prisma.user.update({ where: { id: user.id }, data: { emailConfirmedAt: new Date() } });
      }
      await this.superuserEmailBootstrapService.grantIfAllowlisted(user.id, email);
      await this.prisma.user.update({ where: { id: user.id }, data: { lastSignInAt: new Date() } });
      const redirect = new URL(frontendUrl);
      const loginCredential = await this.tokenService.createEmailLoginCredential(user.id);
      redirect.searchParams.set('code', loginCredential);
      return response.redirect(redirect.toString());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Неизвестная ошибка VK';
      return this.redirectError(response, frontendUrl, message, 'vk_auth_failed');
    }
  }

  private redirectError(response: Response, frontendUrl: string, message: string, code = 'oauth_error') {
    const redirect = new URL(frontendUrl);
    redirect.searchParams.set('oauthError', message);
    redirect.searchParams.set('oauthProvider', 'vk');
    redirect.searchParams.set('oauthErrorCode', code);
    return response.redirect(redirect.toString());
  }
}
