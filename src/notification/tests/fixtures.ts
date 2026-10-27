type PushTokenInputFixture = {
  token: string;
  platform: 'android';
};

export function makePushTokenInput(overrides: Partial<PushTokenInputFixture> = {}) {
  return {
    token: 'ExpoPushToken[device-token]',
    platform: 'android' as const,
    ...overrides,
  };
}
