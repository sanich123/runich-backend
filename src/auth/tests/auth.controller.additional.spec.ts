import { ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { AuthController } from '../controllers/auth.controller';

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();
const syncMock = () => jest.fn<(...args: unknown[]) => unknown>();

function createRequest(user?: { id: string; userId?: string; sessionId?: string }) {
  const headers: Record<string, string> = {
    'x-device-id': 'device-1',
    'x-device-name': 'Phone',
    'x-platform': 'ios',
    'x-device-model': 'iPhone',
    'x-device-manufacturer': 'Apple',
    'x-device-os-name': 'iOS',
    'x-device-os-version': '18',
    'x-device-type': 'phone',
    'x-app-version': '1.0',
    'x-app-build': '10',
    'user-agent': 'agent',
  };
  return {
    user,
    ip: '127.0.0.1',
    header: jest.fn((name: string) => headers[name]),
  };
}

describe('AuthController additional routes', () => {
  const authService = {
    startYandexAuth: syncMock(),
    handleYandexCallback: asyncMock(),
    startVkAuth: syncMock(),
    handleVkCallback: syncMock(),
    login: asyncMock(),
    refreshAccessToken: asyncMock(),
    verifyToken: asyncMock(),
    deleteUser: asyncMock(),
  };
  const prisma = {
    user: { findUnique: asyncMock() },
    userSession: { update: asyncMock() },
  };
  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(authService as never, prisma as never);
  });

  it('delegates Yandex and VK entrypoints with all callback parameters', async () => {
    const response = { redirect: jest.fn() };
    authService.startYandexAuth.mockReturnValue('yandex-start');
    authService.handleYandexCallback.mockResolvedValue('yandex-callback');
    authService.startVkAuth.mockReturnValue('vk-start');
    authService.handleVkCallback.mockReturnValue('vk-callback');

    expect(controller.startYandexAuth(response as never)).toBe('yandex-start');
    await expect(controller.yandexCallback('code', 'error', response as never)).resolves.toBe('yandex-callback');
    expect(controller.startVkAuth(response as never)).toBe('vk-start');
    expect(controller.vkCallback('code', 'state', 'error', 'device', response as never)).toBe('vk-callback');
    expect(authService.handleVkCallback).toHaveBeenCalledWith('code', 'state', 'error', response, 'device');
  });

  it.each([
    ['YANDEX', 'Яндекс'],
    ['VK', 'VK'],
  ])('rejects registration for a confirmed %s account', async (provider, providerName) => {
    prisma.user.findUnique.mockResolvedValue({ emailConfirmedAt: new Date(), authProvider: provider });

    await expect(controller.registerUser({ email: 'user@yandex.ru', password: 'password' })).rejects.toThrow(
      `Пользователь зарегистрирован с помощью провайдера ${providerName}`,
    );
  });

  it('passes request device metadata to login, refresh and verify', async () => {
    const request = createRequest();
    authService.login.mockResolvedValue('login');
    authService.refreshAccessToken.mockResolvedValue('refresh');
    authService.verifyToken.mockResolvedValue('verify');

    await expect(controller.login({ email: 'user@example.com', password: 'password' }, request as never)).resolves.toBe(
      'login',
    );
    await expect(controller.refresh({ refreshToken: 'refresh-token' }, request as never)).resolves.toBe('refresh');
    await expect(controller.verifyTokenAndAppVersion({ code: 'login-code' }, request as never)).resolves.toBe('verify');

    expect(authService.login).toHaveBeenCalledWith(
      'user@example.com',
      'password',
      expect.objectContaining({
        deviceId: 'device-1',
        ipAddress: '127.0.0.1',
      }),
    );
    expect(authService.refreshAccessToken).toHaveBeenCalledWith('refresh-token', expect.any(Object));
    expect(authService.verifyToken).toHaveBeenCalledWith('login-code', expect.any(Object));
  });

  it('uses the stateless overload when request metadata is absent', async () => {
    authService.login.mockResolvedValue('login');
    authService.refreshAccessToken.mockResolvedValue('refresh');
    authService.verifyToken.mockResolvedValue('verify');

    await controller.login({ email: 'user@example.com', password: 'password' });
    await controller.refresh({ refreshToken: 'refresh-token' });
    await controller.verifyTokenAndAppVersion({ code: 'code' });

    expect(authService.login).toHaveBeenCalledWith('user@example.com', 'password');
    expect(authService.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(authService.verifyToken).toHaveBeenCalledWith('code', undefined);
  });

  it('updates a session location only when a session and complete coordinates exist', async () => {
    const request = createRequest({ id: 'user-1', sessionId: 'session-1' });

    await expect(
      controller.updateSessionLocation(request as never, { latitude: 55.75, longitude: 37.61 }),
    ).resolves.toEqual({
      updated: true,
    });
    expect(prisma.userSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        lastLatitude: 55.75,
        lastLongitude: 37.61,
        lastLocationAt: expect.any(Date),
      }),
    });

    prisma.userSession.update.mockClear();
    await expect(controller.updateSessionLocation(request as never, { latitude: 55.75 })).resolves.toEqual({
      updated: true,
    });
    expect(prisma.userSession.update).not.toHaveBeenCalled();
    await expect(
      controller.updateSessionLocation(createRequest() as never, { latitude: 55, longitude: 37 }),
    ).resolves.toEqual({
      updated: false,
    });
  });

  it('requires self-service for account deletion and supports both JWT id shapes', async () => {
    authService.deleteUser.mockResolvedValue(undefined);
    await expect(controller.deleteUser({ userId: 'user-1' })).resolves.toBeUndefined();
    expect(authService.deleteUser).toHaveBeenCalledWith('user-1');

    await expect(
      controller.deleteUser({ userId: 'user-1' }, createRequest({ id: 'user-1' }) as never),
    ).resolves.toBeUndefined();
    await expect(
      controller.deleteUser({ userId: 'user-2' }, createRequest({ id: 'user-1', userId: 'user-2' }) as never),
    ).resolves.toBeUndefined();
    await expect(
      controller.deleteUser({ userId: 'user-2' }, createRequest({ id: 'user-1' }) as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
