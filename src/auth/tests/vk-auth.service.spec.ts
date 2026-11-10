import { JwtService } from '@nestjs/jwt';
import { jest } from '@jest/globals';
import { VkAuthService } from '../services/vk-auth.service';
import type { SessionMetadata } from '../types/auth.types';
import { makeConfirmedAuthUser } from './fixtures';

type RedirectResponse = { redirect: jest.Mock };

describe('VkAuthService', () => {
  const prismaMock = { user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } };
  const jwt = {
    sign: jest.fn(() => 'signed-state'),
    verify: jest.fn(() => ({ codeVerifier: 'verifier' })),
  } as unknown as JwtService;
  const tokenService = {
    createAccessToken: jest.fn(() => 'app-token'),
    createEmailLoginCredential: jest.fn(() => 'app-token'),
    createSessionTokens: jest.fn(async (userId: string) => ({
      userId,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })),
  } as unknown as ConstructorParameters<typeof VkAuthService>[2];
  const superuserBootstrap = { grantIfAllowlisted: jest.fn() };
  let service: VkAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VK_CLIENT_ID = '123';
    process.env.VK_REDIRECT_URI = 'https://runich.example/auth/vk/callback';
    process.env.VK_NATIVE_CLIENT_ID = 'native-client-id';
    process.env.VK_NATIVE_REDIRECT_URI = 'runich://vk/callback';
    process.env.JWT_SECRET = 'secret';
    service = new VkAuthService(
      prismaMock as unknown as ConstructorParameters<typeof VkAuthService>[0],
      jwt,
      tokenService,
      superuserBootstrap as unknown as ConstructorParameters<typeof VkAuthService>[3],
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['missing code', '', 'device-1', 'v'.repeat(43)],
    ['oversized code', 'c'.repeat(4097), 'device-1', 'v'.repeat(43)],
    ['missing device id', 'code', '', 'v'.repeat(43)],
    ['oversized device id', 'code', 'd'.repeat(257), 'v'.repeat(43)],
    ['invalid PKCE verifier', 'code', 'device-1', 'short'],
  ])('rejects native VK login with %s before contacting VK', async (_case, code, deviceId, verifier) => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(service.loginWithNativeCode(code, deviceId, verifier)).rejects.toThrow(
      'Недействительные параметры авторизации VK',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a failed token response', { payload: {}, status: 401 }],
    ['a token without an access token', { payload: { user_id: '42' }, status: 200 }],
    ['a token without a user id', { payload: { access_token: 'vk-token' }, status: 200 }],
  ])('rejects native VK login with %s', async (_case, tokenResponse) => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(tokenResponse.payload), { status: tokenResponse.status }));

    await expect(service.loginWithNativeCode('code', 'device-1', 'v'.repeat(43))).rejects.toThrow(
      'Не удалось проверить авторизацию VK',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a failed profile response', { payload: {}, status: 503 }],
    ['a response without a user profile', { payload: {}, status: 200 }],
  ])('rejects native VK login with %s', async (_case, profileResponse) => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'vk-token', user_id: '42' })))
      .mockResolvedValueOnce(new Response(JSON.stringify(profileResponse.payload), { status: profileResponse.status }));

    await expect(service.loginWithNativeCode('code', 'device-1', 'v'.repeat(43))).rejects.toThrow(
      'Не удалось получить профиль VK',
    );
  });

  it('creates a VK user from the native profile and uses the configured redirect URI', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'vk-token', user_id: 42, email: ' Runner@Example.COM ' })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              user_id: 'vk-profile-42',
              first_name: 'Ivan',
              last_name: 'Runner',
              city: 'Moscow',
              avatar: 'https://example.com/avatar.jpg',
            },
          }),
        ),
      );
    (prismaMock.user.findUnique as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(null);
    (prismaMock.user.create as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(
      makeConfirmedAuthUser(),
    );

    const result = await service.loginWithNativeCode('native-code', 'device-1', 'v'.repeat(43));

    expect(String((fetchMock.mock.calls[0][1] as RequestInit).body)).toContain('client_id=native-client-id');
    expect(String((fetchMock.mock.calls[0][1] as RequestInit).body)).toContain(
      'redirect_uri=runich%3A%2F%2Fvk%2Fcallback',
    );
    expect(String((fetchMock.mock.calls[0][1] as RequestInit).body)).toContain('code_verifier=' + 'v'.repeat(43));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://id.vk.com/oauth2/user_info', expect.any(Object));
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'runner@example.com',
        authProvider: 'VK',
        profile: {
          create: expect.objectContaining({
            name: 'Ivan',
            surname: 'Runner',
            city: 'Moscow',
            profilePhoto: 'https://example.com/avatar.jpg',
            email: 'runner@example.com',
          }),
        },
      }),
    });
    expect(tokenService.createSessionTokens).toHaveBeenCalledWith('user-1', {});
    expect(result).toEqual({ userId: 'user-1', accessToken: 'access-token', refreshToken: 'refresh-token' });
  });

  it('uses profile email and confirms an existing VK user with supplied session metadata', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'vk-token', user_id: 42 })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: { email: ' Profile@Example.COM ', first_name: 'Ivan' } })),
      );
    (prismaMock.user.findUnique as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({
      id: 'user-1',
      emailConfirmedAt: null,
    });
    (prismaMock.user.update as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(
      makeConfirmedAuthUser(),
    );
    const metadata: SessionMetadata = { deviceId: 'device-1', platform: 'android' };

    await service.loginWithNativeCode('native-code', 'device-1', 'v'.repeat(43), metadata);

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'profile@example.com' } }),
    );
    expect(prismaMock.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'user-1' },
      data: { emailConfirmedAt: expect.any(Date) },
    });
    expect(prismaMock.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-1' },
      data: { lastSignInAt: expect.any(Date) },
    });
    expect(tokenService.createSessionTokens).toHaveBeenCalledWith('user-1', metadata);
  });

  it('uses a synthetic VK email when the provider returns no email', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'vk-token', user_id: 42 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: {} })));
    (prismaMock.user.findUnique as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(null);
    (prismaMock.user.create as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(
      makeConfirmedAuthUser(),
    );

    await service.loginWithNativeCode('native-code', 'device-1', 'v'.repeat(43));

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'vk_42@vk.local' } }),
    );
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'vk_42@vk.local' }) }),
    );
  });

  it('uses the default VK native client and redirect values when no overrides are configured', async () => {
    delete process.env.VK_NATIVE_CLIENT_ID;
    delete process.env.VK_NATIVE_REDIRECT_URI;
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'vk-token', user_id: 42 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: {} })));
    (prismaMock.user.findUnique as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(null);
    (prismaMock.user.create as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(
      makeConfirmedAuthUser(),
    );

    await service.loginWithNativeCode('native-code', 'device-1', 'v'.repeat(43));

    const tokenRequest = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(tokenRequest).toContain('client_id=54878048');
    expect(tokenRequest).toContain('redirect_uri=vk54878048%3A%2F%2Fvk.ru%2Fblank.html');
  });

  it('builds a VK ID authorization URL with S256 PKCE', () => {
    const response = { redirect: jest.fn() } as RedirectResponse;

    service.start(response as unknown as Parameters<typeof service.start>[0]);

    const url = new URL(String(response.redirect.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://id.vk.com/authorize');
    expect(url.searchParams.get('client_id')).toBe('123');
    expect(url.searchParams.get('scope')).toBe('vkid.personal_info email');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('encodes the signed state without JWT separators for the VK round trip', () => {
    const response = { redirect: jest.fn() } as RedirectResponse;

    service.start(response as unknown as Parameters<typeof service.start>[0]);

    const url = new URL(String(response.redirect.mock.calls[0][0]));
    const state = url.searchParams.get('state') ?? '';
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(state).not.toContain('.');
    expect(Buffer.from(state, 'base64url').toString('utf8')).toBe('signed-state');
  });

  it.each([
    ['returns the provider error', 'code', 'state', 'access_denied', 'access_denied'],
    ['uses a missing_code error when code is absent', '', 'state', '', 'missing_code'],
    ['uses a missing_code error when state is absent', 'code', '', '', 'missing_code'],
  ])('%s without contacting VK', async (_name, code, state, error, expectedError) => {
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      code,
      state,
      error,
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    const redirect = new URL(String(response.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('oauthError')).toBe(expectedError);
    expect(redirect.searchParams.get('oauthErrorCode')).toBe('oauth_error');
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it('rejects an invalid signed VK state', async () => {
    (jwt.verify as jest.Mock).mockImplementationOnce(() => {
      throw new Error('invalid state');
    });
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    const redirect = new URL(String(response.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('oauthErrorCode')).toBe('invalid_state');
    expect(redirect.searchParams.get('oauthError')).toBe('Недействительный state VK');
  });

  it('rejects a signed state without a code verifier', async () => {
    (jwt.verify as jest.Mock).mockImplementationOnce(() => ({}));
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    const redirect = new URL(String(response.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('oauthErrorCode')).toBe('missing_verifier');
  });

  it('redirects to the frontend with a readable error when device_id is missing', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const response = { redirect: jest.fn() } as RedirectResponse;
    await service.callback('code', 'state', '', response as unknown as Parameters<typeof service.callback>[3]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('oauthError=VK+%D0%BD%D0%B5+%D0%B2%D0%B5%D1%80%D0%BD%D1%83%D0%BB+device_id'),
    );
    fetchMock.mockRestore();
  });

  it('redirects VK token errors with the provider description', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'invalid code_verifier' }), {
        status: 400,
      }),
    );
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining('oauthError=invalid+code_verifier'));
    expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining('oauthErrorCode=invalid_grant'));
  });

  it('uses fallback values when VK returns an incomplete token error', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 400 }));
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    const redirect = new URL(String(response.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('oauthError')).toBe('VK не выдал токен');
    expect(redirect.searchParams.get('oauthErrorCode')).toBe('token_exchange_failed');
  });

  it.each([
    ['access_token is absent', { user_id: '42' }],
    ['user_id is absent', { access_token: 'vk-token' }],
  ])('rejects a token when %s', async (_name, tokenPayload) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(tokenPayload)));
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    const redirect = new URL(String(response.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('oauthErrorCode')).toBe('invalid_token_response');
  });

  it('uses fallback values when VK returns an incomplete profile error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'vk-token', user_id: '42' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    const redirect = new URL(String(response.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('oauthError')).toBe('VK не вернул профиль пользователя');
    expect(redirect.searchParams.get('oauthErrorCode')).toBe('profile_failed');
  });

  it('rejects a non-successful VK profile response before reading the profile', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'vk-token', user_id: '42' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 503 }));
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    const redirect = new URL(String(response.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('oauthErrorCode')).toBe('profile_failed');
  });

  it('exchanges the code and creates a user from VK ID profile', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'vk-token', user_id: '42' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ user: { user_id: '42', first_name: 'Ivan', last_name: 'Ivanov', city: 'Moscow' } }),
        ),
      );
    (prismaMock.user.findUnique as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(null);
    (prismaMock.user.create as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(
      makeConfirmedAuthUser(),
    );
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://id.vk.com/oauth2/auth',
      expect.objectContaining({ method: 'POST' }),
    );
    const tokenRequest = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(tokenRequest.body)).toContain('grant_type=authorization_code');
    expect(String(tokenRequest.body)).toContain('device_id=device-1');
    expect(String(tokenRequest.body)).toContain('code_verifier=verifier');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://id.vk.com/oauth2/user_info', expect.any(Object));
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'vk_42@vk.local', authProvider: 'VK' }),
      }),
    );
    expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining('code=app-token'));
  });

  it('uses the token identity and email for an already confirmed user', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'vk-token', user_id: 42, email: ' IVAN@EXAMPLE.COM ' })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { first_name: 'Ivan' } })));
    (prismaMock.user.findUnique as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(
      makeConfirmedAuthUser(),
    );
    (prismaMock.user.update as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(
      makeConfirmedAuthUser(),
    );
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ivan@example.com' } }),
    );
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining('code=app-token'));
  });

  it('confirms an existing VK user and falls back to the token profile id', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'vk-token', user_id: 42 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { first_name: 'Ivan' } })));
    (prismaMock.user.findUnique as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({
      id: 'user-1',
      emailConfirmedAt: null,
    });
    (prismaMock.user.update as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(
      makeConfirmedAuthUser(),
    );
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'vk_42@vk.local' } }),
    );
    expect(prismaMock.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'user-1' },
      data: { emailConfirmedAt: expect.any(Date) },
    });
    expect(prismaMock.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-1' },
      data: { lastSignInAt: expect.any(Date) },
    });
  });

  it('redirects a VK exchange Error to the frontend', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('VK unavailable'));
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    const redirect = new URL(String(response.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('oauthError')).toBe('VK unavailable');
    expect(redirect.searchParams.get('oauthErrorCode')).toBe('vk_auth_failed');
  });

  it('uses a generic message for a non-Error VK failure', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce('VK unavailable');
    const response = { redirect: jest.fn() } as RedirectResponse;

    await service.callback(
      'code',
      'state',
      '',
      response as unknown as Parameters<typeof service.callback>[3],
      'device-1',
    );

    const redirect = new URL(String(response.redirect.mock.calls[0][0]));
    expect(redirect.searchParams.get('oauthError')).toBe('Неизвестная ошибка VK');
  });
});
