import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { Response } from 'express';
import { AuthTokenService } from './auth-token.service';
import { getAuthFrontendRedirectUri } from 'src/common/config/environment';
import { normalizeEmail } from '../utils/russian-email';
import { SuperuserEmailBootstrapService } from './superuser-email-bootstrap.service';
import type { SessionMetadata } from '../types/auth.types';
import { provisionSocialEmailAccount } from '../utils/social-auth-account';
import { parseYandexUserProfile } from '../utils/yandex-auth.utils';

@Injectable()
export class YandexAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthTokenService) private readonly tokenService: AuthTokenService,
    @Inject(SuperuserEmailBootstrapService)
    private readonly superuserEmailBootstrapService = new SuperuserEmailBootstrapService(prisma),
  ) {}

  start(response: Response) {
    const url = new URL('https://oauth.yandex.ru/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', process.env.YANDEX_CLIENT_ID!);
    url.searchParams.set('redirect_uri', process.env.YANDEX_REDIRECT_URI!);
    url.searchParams.set('force_confirm', 'yes');
    return response.redirect(url.toString());
  }

  async loginWithAccessToken(yandexAccessToken: string, metadata: SessionMetadata = {}) {
    if (!yandexAccessToken || yandexAccessToken.length > 8192) {
      throw new UnauthorizedException('Недействительный токен Яндекс');
    }
    const userId = await this.getOrCreateUser(yandexAccessToken, 'Не удалось проверить токен Яндекс');
    return this.tokenService.createSessionTokens(userId, metadata);
  }

  async callback(code: string, error: string, response: Response) {
    const frontendUrl = getAuthFrontendRedirectUri();
    if (error || !code) {
      const redirect = new URL(frontendUrl);
      redirect.searchParams.set('oauthError', error || 'missing_code');
      return response.redirect(redirect.toString());
    }

    const tokenResponse = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.YANDEX_CLIENT_ID!,
        client_secret: process.env.YANDEX_CLIENT_SECRET!,
      }),
    });
    if (!tokenResponse.ok) throw new UnauthorizedException('Не удалось получить токен Яндекс');
    const { access_token: yandexAccessToken } = (await tokenResponse.json()) as { access_token?: string };
    if (!yandexAccessToken) throw new UnauthorizedException('Яндекс не вернул access token');

    const userId = await this.getOrCreateUser(yandexAccessToken, 'Не удалось получить данные пользователя Яндекс');

    const redirect = new URL(frontendUrl);
    const loginCredential = await this.tokenService.createEmailLoginCredential(userId);
    redirect.searchParams.set('code', loginCredential);
    return response.redirect(redirect.toString());
  }

  private async getOrCreateUser(accessToken: string, requestFailureMessage: string): Promise<string> {
    const userResponse = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
    if (!userResponse.ok) throw new UnauthorizedException(requestFailureMessage);

    let payload: unknown;
    try {
      payload = await userResponse.json();
    } catch {
      throw new UnauthorizedException('Яндекс вернул некорректный профиль пользователя');
    }
    const yandexUser = parseYandexUserProfile(payload);
    const rawEmail = yandexUser.default_email ?? (yandexUser.login ? `${yandexUser.login}@yandex.ru` : undefined);
    if (!rawEmail) throw new UnauthorizedException('Яндекс не вернул email пользователя');
    const email = normalizeEmail(rawEmail);

    return provisionSocialEmailAccount(this.prisma, this.superuserEmailBootstrapService, {
      email,
      provider: 'YANDEX',
      profile: {
        name: yandexUser.first_name ?? yandexUser.real_name?.split(' ')[0],
        surname: yandexUser.last_name,
        city: yandexUser.city,
        profilePhoto: yandexUser.default_avatar_id
          ? `https://avatars.yandex.net/get-yapic/${yandexUser.default_avatar_id}/islands-200`
          : undefined,
      },
    });
  }
}
