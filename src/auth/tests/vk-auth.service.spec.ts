import { JwtService } from '@nestjs/jwt';
import { jest } from '@jest/globals';
import { VkAuthService } from '../services/vk-auth.service';

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
  } as unknown as ConstructorParameters<typeof VkAuthService>[2];
  let service: VkAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VK_CLIENT_ID = '123';
    process.env.VK_REDIRECT_URI = 'https://runich.example/auth/vk/callback';
    process.env.JWT_SECRET = 'secret';
    service = new VkAuthService(
      prismaMock as unknown as ConstructorParameters<typeof VkAuthService>[0],
      jwt,
      tokenService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['VK_CLIENT_ID', 'VK_REDIRECT_URI', 'JWT_SECRET'])('rejects VK start when %s is missing', (variable) => {
    delete process.env[variable];
    const response = { redirect: jest.fn() } as RedirectResponse;

    expect(() => service.start(response as unknown as Parameters<typeof service.start>[0])).toThrow(
      'Авторизация через VK не настроена',
    );
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
    (prismaMock.user.create as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({
      id: 'user-1',
      emailConfirmedAt: new Date(),
    });
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
    (prismaMock.user.findUnique as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({
      id: 'user-1',
      emailConfirmedAt: new Date(),
    });
    (prismaMock.user.update as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({
      id: 'user-1',
      emailConfirmedAt: new Date(),
    });
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
    (prismaMock.user.update as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({
      id: 'user-1',
      emailConfirmedAt: new Date(),
    });
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
