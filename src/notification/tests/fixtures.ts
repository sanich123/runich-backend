type PushTokenInputFixture = {
  token: string;
  platform: 'android' | 'ios';
};

export function makePushTokenInput(overrides: Partial<PushTokenInputFixture> = {}) {
  return {
    token: 'ExpoPushToken[device-token]',
    platform: 'android' as const,
    ...overrides,
  };
}
