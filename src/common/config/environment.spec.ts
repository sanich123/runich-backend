import {
  getAppEnvironment,
  getAuthFrontendRedirectUri,
  getCorsOrigins,
  isSwaggerEnabled,
  shouldSeedMockData,
} from './environment';

describe('environment config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('normalizes the configured application environment', () => {
    process.env.APP_ENV = '  STAGE ';

    expect(getAppEnvironment()).toBe('stage');
  });

  it('falls back to production for an unknown environment in production', () => {
    process.env.APP_ENV = 'unknown';
    process.env.NODE_ENV = 'production';

    expect(getAppEnvironment()).toBe('production');
  });

  it('falls back to local for an unknown non-production environment', () => {
    process.env.APP_ENV = 'unknown';
    process.env.NODE_ENV = 'test';

    expect(getAppEnvironment()).toBe('local');
  });

  it('prefers an explicit auth redirect URI and otherwise uses the environment default', () => {
    process.env.APP_ENV = 'stage';
    process.env.AUTH_FRONTEND_REDIRECT_URI = '  https://example.test/callback  ';

    expect(getAuthFrontendRedirectUri()).toBe('https://example.test/callback');

    delete process.env.AUTH_FRONTEND_REDIRECT_URI;
    expect(getAuthFrontendRedirectUri()).toBe('https://stage-web.runich-app.ru/login-from-url');
  });

  it('enables Swagger and mock data only outside production', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'local';
    expect(isSwaggerEnabled()).toBe(true);
    expect(shouldSeedMockData()).toBe(true);

    process.env.APP_ENV = 'stage';
    expect(isSwaggerEnabled()).toBe(true);
    expect(shouldSeedMockData()).toBe(true);

    process.env.APP_ENV = 'production';
    expect(isSwaggerEnabled()).toBe(false);
    expect(shouldSeedMockData()).toBe(false);

    process.env.APP_ENV = 'local';
    process.env.NODE_ENV = 'test';
    expect(shouldSeedMockData()).toBe(false);
  });

  it('selects the expected CORS origins for each environment', () => {
    process.env.APP_ENV = 'local';
    expect(getCorsOrigins()).toHaveLength(3);

    process.env.APP_ENV = 'stage';
    expect(getCorsOrigins()).toEqual([
      'https://stage-web.runich-app.ru',
      /^https?:\/\/localhost(?::\d+)?$/,
      /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
      /^https?:\/\/\[::1\](?::\d+)?$/,
    ]);

    process.env.APP_ENV = 'production';
    expect(getCorsOrigins()).toEqual([
      'https://runich-app.ru',
      /^https?:\/\/localhost(?::\d+)?$/,
      /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
      /^https?:\/\/\[::1\](?::\d+)?$/,
    ]);

    process.env.APP_ENV = 'unknown';
    process.env.NODE_ENV = 'test';
    expect(getCorsOrigins()).toHaveLength(3);
  });
});
