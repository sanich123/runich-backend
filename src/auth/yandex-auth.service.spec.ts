import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { YandexAuthService } from './yandex-auth.service';

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
  };
  const originalEnvironment = { ...process.env };
  let service: YandexAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.YANDEX_CLIENT_ID = 'client-id';
    process.env.YANDEX_CLIENT_SECRET = 'client-secret';
    process.env.YANDEX_REDIRECT_URI = 'https://api.example/auth/yandex/callback';
    process.env.YANDEX_FRONTEND_REDIRECT_URI = 'https://app.example/login-from-url';
    tokenService.createEmailLoginCredential.mockResolvedValue('login-code');
    service = new YandexAuthService(prisma as never, tokenService as never);
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

  it('rejects a missing Yandex configuration', () => {
    delete process.env.YANDEX_CLIENT_ID;

    expect(() => service.start(responseMock() as never)).toThrow(ServiceUnavailableException);
  });

  it('redirects callback errors and missing codes to the frontend', async () => {
    const response = responseMock();

    await service.callback('', 'access_denied', response as never);
    expect(response.redirect).toHaveBeenCalledWith('https://app.example/login-from-url?oauthError=access_denied');

    response.redirect.mockClear();
    await service.callback('', '', response as never);
    expect(response.redirect).toHaveBeenCalledWith('https://app.example/login-from-url?oauthError=missing_code');
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
    prisma.user.create.mockResolvedValue({ id: 'user-1', emailConfirmedAt: new Date() });

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
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'runner' }), { status: 200 }));
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailConfirmedAt: null });
    prisma.user.update.mockResolvedValue({ id: 'user-1' });
    const response = responseMock();
    await service.callback('code', '', response as never);

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
});
