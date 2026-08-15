import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { Response } from 'express';
import { AuthTokenService } from './auth-token.service';

@Injectable()
export class YandexAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: AuthTokenService,
  ) {}

  start(response: Response) {
    const clientId = process.env.YANDEX_CLIENT_ID;
    const redirectUri = process.env.YANDEX_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      throw new ServiceUnavailableException('Авторизация через Яндекс не настроена');
    }
    const url = new URL('https://oauth.yandex.ru/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('force_confirm', 'yes');
    return response.redirect(url.toString());
  }

  async callback(code: string, error: string, response: Response) {
    const frontendUrl = process.env.YANDEX_FRONTEND_REDIRECT_URI ?? 'https://runich.netlify.app/sign-in';
    if (error || !code) {
      return response.redirect(`${frontendUrl}?oauthError=${encodeURIComponent(error || 'missing_code')}`);
    }

    const tokenResponse = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.YANDEX_CLIENT_ID ?? '',
        client_secret: process.env.YANDEX_CLIENT_SECRET ?? '',
      }),
    });
    if (!tokenResponse.ok) throw new UnauthorizedException('Не удалось получить токен Яндекс');
    const { access_token: yandexAccessToken } = (await tokenResponse.json()) as { access_token?: string };
    if (!yandexAccessToken) throw new UnauthorizedException('Яндекс не вернул access token');

    const userResponse = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${yandexAccessToken}` },
    });
    if (!userResponse.ok) throw new UnauthorizedException('Не удалось получить данные пользователя Яндекс');
    const yandexUser = (await userResponse.json()) as {
      default_email?: string;
      login?: string;
      first_name?: string;
      last_name?: string;
      real_name?: string;
      city?: string;
      default_avatar_id?: string;
    };
    const email = yandexUser.default_email ?? (yandexUser.login ? `${yandexUser.login}@yandex.ru` : undefined);
    if (!email) throw new UnauthorizedException('Яндекс не вернул email пользователя');

    let user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.users.create({
        data: {
          email,
          auth_provider: 'YANDEX',
          email_confirmed_at: new Date(),
          created_at: new Date(),
          profile: {
            create: {
              name: yandexUser.first_name ?? yandexUser.real_name?.split(' ')[0],
              surname: yandexUser.last_name,
              city: yandexUser.city,
              profilePhoto: yandexUser.default_avatar_id
                ? `https://avatars.yandex.net/get-yapic/${yandexUser.default_avatar_id}/islands-200`
                : undefined,
              email,
            },
          },
        },
      });
    } else if (!user.email_confirmed_at) {
      user = await this.prisma.users.update({ where: { id: user.id }, data: { email_confirmed_at: new Date() } });
    }
    await this.prisma.users.update({ where: { id: user.id }, data: { last_sign_in_at: new Date() } });

    const redirect = new URL(frontendUrl);
    redirect.searchParams.set('accessToken', this.tokenService.createAccessToken(user.id));
    return response.redirect(redirect.toString());
  }
}
