import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { Response } from 'express';
import { AuthTokenService } from './auth-token.service';

type VkState = { codeVerifier: string };

@Injectable()
export class VkAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tokenService: AuthTokenService,
  ) {}

  start(response: Response) {
    const clientId = process.env.VK_CLIENT_ID;
    const redirectUri = process.env.VK_REDIRECT_URI;
    if (!clientId || !redirectUri || !process.env.JWT_SECRET) {
      throw new ServiceUnavailableException('Авторизация через VK не настроена');
    }

    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state = this.jwtService.sign({ codeVerifier } satisfies VkState, { expiresIn: '10m' });
    const url = new URL('https://oauth.vk.com/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'email');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return response.redirect(url.toString());
  }

  async callback(code: string, state: string, error: string, response: Response) {
    const frontendUrl = process.env.VK_FRONTEND_REDIRECT_URI ?? 'https://runich.netlify.app/sign-in';
    if (error || !code || !state) {
      return response.redirect(`${frontendUrl}?oauthError=${encodeURIComponent(error || 'missing_code')}`);
    }

    let statePayload: VkState;
    try {
      statePayload = this.jwtService.verify<VkState>(state);
    } catch {
      throw new UnauthorizedException('Недействительный state VK');
    }
    if (!statePayload.codeVerifier) throw new UnauthorizedException('VK не вернул code verifier');

    const tokenResponse = await fetch('https://oauth.vk.com/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.VK_CLIENT_ID ?? '',
        client_secret: process.env.VK_CLIENT_SECRET ?? '',
        redirect_uri: process.env.VK_REDIRECT_URI ?? '',
        code,
        code_verifier: statePayload.codeVerifier,
      }),
    });
    if (!tokenResponse.ok) throw new UnauthorizedException('Не удалось получить токен VK');
    const tokens = (await tokenResponse.json()) as { access_token?: string; user_id?: number; email?: string };
    if (!tokens.access_token || !tokens.user_id) throw new UnauthorizedException('VK не вернул данные токена');

    const profileResponse = await fetch(
      `https://api.vk.com/method/users.get?user_ids=${tokens.user_id}&fields=photo_200,city&v=${process.env.VK_API_VERSION ?? '5.199'}`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!profileResponse.ok) throw new UnauthorizedException('Не удалось получить профиль VK');
    const profilePayload = (await profileResponse.json()) as {
      response?: Array<{
        id: number;
        first_name?: string;
        last_name?: string;
        photo_200?: string;
        city?: { title?: string };
      }>;
    };
    const profile = profilePayload.response?.[0];
    if (!profile) throw new UnauthorizedException('VK не вернул профиль пользователя');

    const email = tokens.email ?? `vk_${profile.id}@vk.local`;
    let user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.users.create({
        data: {
          email,
          auth_provider: 'VK',
          email_confirmed_at: new Date(),
          created_at: new Date(),
          profile: {
            create: {
              name: profile.first_name,
              surname: profile.last_name,
              city: profile.city?.title,
              profilePhoto: profile.photo_200,
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
