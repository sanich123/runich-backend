type AppEnvironment = 'local' | 'stage' | 'production';

export interface ApiStartupConfiguration {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
}

function requireEnvironmentValue(name: string) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Обязательная переменная окружения ${name} не задана`);
  return value;
}

export function getJwtSecret() {
  return requireEnvironmentValue('JWT_SECRET');
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL;
}

export function getHttpPort() {
  return Number(process.env.PORT) || 3000;
}

export function loadApiStartupConfiguration(): ApiStartupConfiguration {
  return {
    databaseUrl: requireEnvironmentValue('DATABASE_URL'),
    jwtSecret: getJwtSecret(),
    port: getHttpPort(),
  };
}

const LOCAL_CORS_ORIGINS = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https?:\/\/\[::1\](?::\d+)?$/,
];

const DEFAULT_AUTH_FRONTEND_REDIRECT_URIS: Record<AppEnvironment, string> = {
  local: 'http://localhost:5173/login-from-url',
  stage: 'https://stage-web.runich-app.ru/login-from-url',
  production: 'https://runich-app.ru/login-from-url',
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

export function isSwaggerEnabled() {
  return getAppEnvironment() !== 'production';
}

export function shouldSeedMockData() {
  const appEnvironment = getAppEnvironment();
  return process.env.NODE_ENV !== 'test' && (appEnvironment === 'local' || appEnvironment === 'stage');
}

export function getCorsOrigins() {
  switch (getAppEnvironment()) {
    case 'production':
      return ['https://runich-app.ru', ...LOCAL_CORS_ORIGINS];
    case 'stage':
      return ['https://stage-web.runich-app.ru', ...LOCAL_CORS_ORIGINS];
    case 'local':
      return LOCAL_CORS_ORIGINS;
  }
}
