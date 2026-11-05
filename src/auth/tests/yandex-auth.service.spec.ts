import { UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { YandexAuthService } from '../services/yandex-auth.service';
import type { SessionMetadata } from '../types/auth.types';
import { makeConfirmedAuthUser } from './fixtures';

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

type ResponseMock = { redirect: jest.Mock<(...args: unknown[]) => unknown> };

function responseMock(): ResponseMock {
  return { redirect: jest.fn<(...args: unknown[]) => unknown>() };
}

describe('YandexAuthService', () => {
  const prisma = {
    user: {
      findUnique: asyncMock(),
      create: asyncMock(),
      update: asyncMock(),
    },
  };
  const tokenService = {
    createEmailLoginCredential: asyncMock(),
    createSessionTokens: asyncMock(),
  };
  const superuserBootstrap = { grantIfAllowlisted: jest.fn() };
  const originalEnvironment = { ...process.env };
  let service: YandexAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.YANDEX_CLIENT_ID = 'client-id';
    process.env.YANDEX_CLIENT_SECRET = 'client-secret';
    process.env.YANDEX_REDIRECT_URI = 'https://api.example/auth/yandex/callback';
    process.env.AUTH_FRONTEND_REDIRECT_URI = 'https://app.example/login-from-url';
    tokenService.createEmailLoginCredential.mockResolvedValue('login-code');
    tokenService.createSessionTokens.mockResolvedValue({
      userId: 'user-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    service = new YandexAuthService(prisma as never, tokenService as never, superuserBootstrap as never);
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.restoreAllMocks();
  });

  it('builds the Yandex authorization URL', () => {
    const response = responseMock();

    service.start(response as never);

    const url = new URL(String(response.redirect.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://oauth.yandex.ru/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.example/auth/yandex/callback');
    expect(url.searchParams.get('force_confirm')).toBe('yes');
  });

  it('redirects callback errors and missing codes to the frontend', async () => {
    const response = responseMock();

    await service.callback('', 'access_denied', response as never);
    expect(response.redirect).toHaveBeenCalledWith('https://app.example/login-from-url?oauthError=access_denied');

    response.redirect.mockClear();
    await service.callback('', '', response as never);
    expect(response.redirect).toHaveBeenCalledWith('https://app.example/login-from-url?oauthError=missing_code');
  });

  it('preserves existing frontend URL parameters when redirecting an error', async () => {
    process.env.AUTH_FRONTEND_REDIRECT_URI = 'https://app.example/login-from-url?source=email#callback';
    const response = responseMock();

    await service.callback('', 'access_denied', response as never);

    const redirect = new URL(String(response.redirect.mock.calls[0]?.[0]));
    expect(redirect.origin + redirect.pathname).toBe('https://app.example/login-from-url');
    expect(redirect.searchParams.get('source')).toBe('email');
    expect(redirect.searchParams.get('oauthError')).toBe('access_denied');
    expect(redirect.hash).toBe('#callback');
  });

  it('rejects token and user profile provider errors', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('bad token', { status: 400 }));
    await expect(service.callback('code', '', responseMock() as never)).rejects.toBeInstanceOf(UnauthorizedException);

    jest.restoreAllMocks();
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    await expect(service.callback('code', '', responseMock() as never)).rejects.toThrow('access token');

    jest.restoreAllMocks();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'yandex-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('bad profile', { status: 500 }));
    await expect(service.callback('code', '', responseMock() as never)).rejects.toThrow('данные пользователя');
  });

  it('creates a Yandex user and redirects with a persistent login code', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'yandex-token' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            default_email: 'runner@yandex.ru',
            first_name: 'Ann',
            last_name: 'Runner',
            city: 'Moscow',
            default_avatar_id: 'avatar-id',
          }),
          { status: 200 },
        ),
      );
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(makeConfirmedAuthUser());

    const response = responseMock();
    await service.callback('code', '', response as never);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'runner@yandex.ru',
        authProvider: 'YANDEX',
        profile: {
          create: expect.objectContaining({
            name: 'Ann',
            surname: 'Runner',
            profilePhoto: 'https://avatars.yandex.net/get-yapic/avatar-id/islands-200',
          }),
        },
      }),
    });
    expect(tokenService.createEmailLoginCredential).toHaveBeenCalledWith('user-1');
    expect(response.redirect).toHaveBeenCalledWith('https://app.example/login-from-url?code=login-code');
  });

  it('confirms an existing user and always redirects with a login code', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'yandex-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_email: ' Runner@YANDEX.RU ' }), { status: 200 }));
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailConfirmedAt: null });
    prisma.user.update.mockResolvedValue({ id: 'user-1' });
    const response = responseMock();
    await service.callback('code', '', response as never);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'runner@yandex.ru' },
      select: { id: true, emailConfirmedAt: true },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
    expect(response.redirect).toHaveBeenCalledWith('https://app.example/login-from-url?code=login-code');
  });

  it('rejects a Yandex profile without an email', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'yandex-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    await expect(service.callback('code', '', responseMock() as never)).rejects.toThrow('email пользователя');
  });

  it.each([
    ['an empty token', ''],
    ['an oversized token', 't'.repeat(8193)],
  ])('rejects native Yandex login with %s before contacting Yandex', async (_case, accessToken) => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(service.loginWithAccessToken(accessToken)).rejects.toThrow('Недействительный токен Яндекс');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a native Yandex token that the provider does not accept', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 401 }));

    await expect(service.loginWithAccessToken('invalid-token')).rejects.toThrow('Не удалось проверить токен Яндекс');

    expect(fetchMock).toHaveBeenCalledWith('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: 'OAuth invalid-token' },
    });
  });

  it('rejects native Yandex profiles that contain neither an email nor a login', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    await expect(service.loginWithAccessToken('valid-token')).rejects.toThrow('Яндекс не вернул email пользователя');

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('creates a native Yandex user from the login fallback and returns session tokens', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          login: 'runner',
          real_name: 'Anna Runner',
          last_name: 'Runner',
          city: 'Moscow',
        }),
        { status: 200 },
      ),
    );
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(makeConfirmedAuthUser());
    const metadata: SessionMetadata = { deviceId: 'device-1', platform: 'android', appVersion: '1.2.3' };

    const result = await service.loginWithAccessToken('native-yandex-token', metadata);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'runner@yandex.ru' },
      select: { id: true, emailConfirmedAt: true },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'runner@yandex.ru',
        authProvider: 'YANDEX',
        emailConfirmedAt: expect.any(Date),
        profile: {
          create: expect.objectContaining({
            name: 'Anna',
            surname: 'Runner',
            city: 'Moscow',
            profilePhoto: undefined,
            email: 'runner@yandex.ru',
          }),
        },
      }),
    });
    expect(tokenService.createSessionTokens).toHaveBeenCalledWith('user-1', metadata);
    expect(result).toEqual({ userId: 'user-1', accessToken: 'access-token', refreshToken: 'refresh-token' });
  });

  it('confirms a native Yandex user and uses a normalized provider email', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          default_email: ' Runner@Yandex.RU ',
          first_name: 'Anna',
          default_avatar_id: 'avatar-id',
        }),
        { status: 200 },
      ),
    );
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailConfirmedAt: null });
    prisma.user.update.mockResolvedValue({ id: 'user-1', emailConfirmedAt: new Date() });

    await service.loginWithAccessToken('native-yandex-token');

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'runner@yandex.ru' } }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'user-1' },
      data: { emailConfirmedAt: expect.any(Date) },
    });
    expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-1' },
      data: { lastSignInAt: expect.any(Date) },
    });
    expect(tokenService.createSessionTokens).toHaveBeenCalledWith('user-1', {});
  });

  it('does not reconfirm an already confirmed native Yandex user', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_email: 'runner@yandex.ru' }), { status: 200 }));
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailConfirmedAt: new Date() });
    prisma.user.update.mockResolvedValue({ id: 'user-1' });

    await service.loginWithAccessToken('native-yandex-token');

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastSignInAt: expect.any(Date) },
    });
  });
});
