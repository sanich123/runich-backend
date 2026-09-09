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
});
