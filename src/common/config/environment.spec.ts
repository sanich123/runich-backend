import {
  getAppEnvironment,
  getAuthFrontendRedirectUri,
  getCorsOrigins,
  isPhotoStorageWriteEnabled,
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
    expect(getAuthFrontendRedirectUri()).toBe('https://stage--runich.netlify.app/login-from-url');
  });

  it('parses the explicit photo upload toggle and uses environment defaults', () => {
    process.env.PHOTO_UPLOADS_ENABLED = 'TRUE';
    expect(isPhotoStorageWriteEnabled()).toBe(true);

    process.env.PHOTO_UPLOADS_ENABLED = 'false';
    expect(isPhotoStorageWriteEnabled()).toBe(false);

    delete process.env.PHOTO_UPLOADS_ENABLED;
    process.env.APP_ENV = 'stage';
    expect(isPhotoStorageWriteEnabled()).toBe(false);

    process.env.APP_ENV = 'local';
    expect(isPhotoStorageWriteEnabled()).toBe(true);
  });

  it('selects the expected CORS origins for each environment', () => {
    process.env.APP_ENV = 'local';
    expect(getCorsOrigins()).toHaveLength(3);

    process.env.APP_ENV = 'stage';
    expect(getCorsOrigins()).toEqual(['https://stage--runich.netlify.app']);

    process.env.APP_ENV = 'production';
    expect(getCorsOrigins()).toEqual(['https://runich.netlify.app']);

    process.env.APP_ENV = 'unknown';
    process.env.NODE_ENV = 'test';
    expect(getCorsOrigins()).toHaveLength(3);
  });
});
