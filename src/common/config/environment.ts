export type AppEnvironment = 'local' | 'stage' | 'production';

const DEFAULT_AUTH_FRONTEND_REDIRECT_URIS: Record<AppEnvironment, string> = {
  local: 'http://localhost:5173/login-from-url',
  stage: 'https://stage--runich.netlify.app/login-from-url',
  production: 'https://runich.netlify.app/login-from-url',
};

export function getAppEnvironment(): AppEnvironment {
  const configuredEnvironment = process.env.APP_ENV?.trim().toLowerCase();
  if (
    configuredEnvironment === 'local' ||
    configuredEnvironment === 'stage' ||
    configuredEnvironment === 'production'
  ) {
    return configuredEnvironment;
  }

  return process.env.NODE_ENV === 'production' ? 'production' : 'local';
}

export function getAuthFrontendRedirectUri() {
  return process.env.AUTH_FRONTEND_REDIRECT_URI?.trim() || DEFAULT_AUTH_FRONTEND_REDIRECT_URIS[getAppEnvironment()];
}

export function isPhotoStorageWriteEnabled() {
  const configuredValue = process.env.PHOTO_UPLOADS_ENABLED?.trim().toLowerCase();
  if (configuredValue !== undefined && configuredValue !== '') return configuredValue === 'true';

  return getAppEnvironment() !== 'stage';
}

export function getCorsOrigins() {
  switch (getAppEnvironment()) {
    case 'production':
      return ['https://runich.netlify.app'];
    case 'stage':
      return ['https://stage--runich.netlify.app'];
    case 'local':
      return [/^https?:\/\/localhost(?::\d+)?$/, /^https?:\/\/127\.0\.0\.1(?::\d+)?$/, /^https?:\/\/\[::1\](?::\d+)?$/];
  }
}
