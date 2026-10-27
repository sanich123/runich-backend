type RefreshTokenClaimsFixture = {
  userId: string;
  type: 'refresh' | 'access';
  sessionId: string;
};

export function makeRefreshTokenClaims(overrides: Partial<RefreshTokenClaimsFixture> = {}) {
  return {
    userId: 'user-1',
    type: 'refresh' as const,
    sessionId: 'session-1',
    ...overrides,
  };
}

type SessionTokensFixture = {
  userId: string;
  accessToken: string;
  refreshToken: string;
};

export function makeSessionTokens(overrides: Partial<SessionTokensFixture> = {}) {
  return {
    userId: 'user-1',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    ...overrides,
  };
}

export function makeLegacySessionTokens() {
  return makeSessionTokens({ refreshToken: 'access-token' });
}

type PasswordUserFixture = {
  id: string;
  encryptedPassword: string;
  emailConfirmedAt?: Date;
  authProvider?: string;
};

export function makePasswordUser(encryptedPassword: string, overrides: Partial<PasswordUserFixture> = {}) {
  return {
    id: 'user-1',
    encryptedPassword,
    ...overrides,
  };
}

export function makeConfirmedPasswordUser(encryptedPassword: string, overrides: Partial<PasswordUserFixture> = {}) {
  return makePasswordUser(encryptedPassword, { emailConfirmedAt: new Date(), ...overrides });
}

type SessionRecordFixture = {
  id: string;
  userId: string;
  refreshHash: string;
  revokedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceModel: string | null;
  manufacturer: string | null;
  osName: string | null;
  osVersion: string | null;
  deviceType: string | null;
  appVersion: string | null;
  appBuild: string | null;
  lastSeenAt?: Date;
};

export function makePersistedSession(
  overrides: Pick<SessionRecordFixture, 'refreshHash'> & Partial<SessionRecordFixture>,
) {
  return {
    id: 'session-1',
    userId: 'user-1',
    revokedAt: null,
    ipAddress: null,
    userAgent: null,
    deviceModel: null,
    manufacturer: null,
    osName: null,
    osVersion: null,
    deviceType: null,
    appVersion: null,
    appBuild: null,
    ...overrides,
  };
}

type PendingConfirmationUserFixture = {
  id: string;
  confirmationToken: string;
  confirmationSentAt: Date;
  emailConfirmedAt: Date | null;
};

export function makePendingConfirmationUser(overrides: Partial<PendingConfirmationUserFixture> = {}) {
  return {
    id: 'user-1',
    confirmationToken: '1234',
    confirmationSentAt: new Date(),
    emailConfirmedAt: null,
    ...overrides,
  };
}

type ConfirmedAuthUserFixture = {
  id: string;
  emailConfirmedAt: Date;
};

export function makeConfirmedAuthUser(overrides: Partial<ConfirmedAuthUserFixture> = {}) {
  return { id: 'user-1', emailConfirmedAt: new Date(), ...overrides };
}
