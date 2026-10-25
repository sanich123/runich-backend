import { chmodSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'dotenv';

const REQUIRED_APP_KEYS = [
  'APP_ENV',
  'JWT_SECRET',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_ACCESS_KEY',
  'S3_QUARANTINE_BUCKET',
  'S3_QUARANTINE_PREFIX',
  'YANDEX_SMTP_USER',
  'YANDEX_SMTP_PASSWORD',
  'MAILRU_SMTP_USER',
  'MAILRU_SMTP_PASSWORD',
  'YANDEX_CLIENT_ID',
  'YANDEX_CLIENT_SECRET',
  'YANDEX_REDIRECT_URI',
  'VK_CLIENT_ID',
  'VK_REDIRECT_URI',
  'MAPBOX_ACCESS_TOKEN',
];

const REQUIRED_STAGE_COMPOSE_KEYS = [
  'DATABASE_URL_DOCKER',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'GRAFANA_LOKI_TOKEN',
];

const REQUIRED_PRODUCTION_COMPOSE_KEYS = ['DATABASE_URL_DOCKER', 'GRAFANA_LOKI_TOKEN'];
const EXPECTED_S3_ENDPOINT = 'https://s3.twcstorage.ru';

function fail(message) {
  console.error(`[env validation] ${message}`);
  process.exitCode = 1;
}

function readEnvFile(filePath, label) {
  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    fail(`${label} is missing or unreadable.`);
    return undefined;
  }

  const keys = new Map();
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(trimmed);
    if (!assignment) {
      fail(`${label} has an invalid entry on line ${index + 1}; use one KEY=value assignment per line.`);
      continue;
    }

    const [, key] = assignment;
    if (keys.has(key)) {
      fail(`${label} defines ${key} more than once.`);
      continue;
    }
    keys.set(key, { line, lineNumber: index + 1 });
  }

  let values;
  try {
    values = parse(source);
  } catch {
    fail(`${label} could not be parsed.`);
    return undefined;
  }

  for (const key of keys.keys()) {
    if (!Object.hasOwn(values, key)) fail(`${label} contains an unreadable value for ${key}.`);
  }

  return { filePath, source, keys, values };
}

function writeEnvAtomically(filePath, source) {
  const temporaryPath = resolve(dirname(filePath), `.env.update-${process.pid}-${Date.now()}`);
  try {
    writeFileSync(temporaryPath, source, { mode: 0o600, flag: 'wx' });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, filePath);
    return true;
  } catch {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // A missing temporary file needs no cleanup.
    }
    fail('could not write the unified .env file atomically.');
    return false;
  }
}

function normalizeDeploymentEnv(filePath, environment) {
  const file = readEnvFile(filePath, '.env');
  if (!file || process.exitCode) return;

  const managedValues = {
    APP_ENV: environment,
    S3_QUARANTINE_BUCKET: 'runich-stage',
    S3_QUARANTINE_PREFIX: `moderation-quarantine/${environment}/`,
  };
  const managedKeys = new Set(Object.keys(managedValues));
  const obsoleteKeys = new Set([
    'AUTH_FRONTEND_REDIRECT_URI',
    'DATABASE_URL',
    'LOG_FILE_PATH',
    'RUNICH_PROCESS',
    'TZ',
    'VK_CLIENT_SECRET',
    ...(environment === 'production' ? ['BACKEND_IMAGE', 'POSTGRES_DB', 'POSTGRES_PASSWORD', 'POSTGRES_USER'] : []),
  ]);
  const existingValuesMatch = Object.entries(managedValues).every(([key, value]) => file.values[key] === value);
  const hasRegionSetting = file.keys.has('S3_REGION');
  const hasObsoleteSettings = [...obsoleteKeys].some((key) => file.keys.has(key));
  if (existingValuesMatch && !hasRegionSetting && !hasObsoleteSettings) return;

  const managedLineNumbers = new Set(
    [...file.keys.entries()]
      .filter(([key]) => managedKeys.has(key) || key === 'S3_REGION' || obsoleteKeys.has(key))
      .map(([, entry]) => entry.lineNumber),
  );
  const preservedLines = file.source.split(/\r?\n/).filter((_, index) => !managedLineNumbers.has(index + 1));
  const normalizedSource = `${preservedLines.join('\n').replace(/\s*$/, '')}\n${Object.entries(managedValues)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
  if (writeEnvAtomically(filePath, normalizedSource)) {
    const changes = [];
    if (!existingValuesMatch) changes.push('normalized APP_ENV and quarantine settings');
    if (hasRegionSetting) changes.push('removed S3_REGION because the region is code-defined');
    if (hasObsoleteSettings) changes.push('removed redundant deployment settings');
    console.log(`[env validation] ${changes.join('; ')}.`);
  }
}

function validateEnvironment(file, environment) {
  const requiredKeys = [
    ...REQUIRED_APP_KEYS,
    ...(environment === 'production' ? ['S3_PUBLIC_URL'] : []),
    ...(environment === 'stage' ? REQUIRED_STAGE_COMPOSE_KEYS : REQUIRED_PRODUCTION_COMPOSE_KEYS),
  ];
  const missingKeys = requiredKeys.filter((key) => !file.values[key]?.trim());
  if (missingKeys.length) fail(`.env is missing required keys: ${missingKeys.join(', ')}.`);
  const placeholderKeys = requiredKeys.filter((key) =>
    /^(?:replace(?:-with)?|change(?:-me)?|your-|example|placeholder|dummy|todo)/i.test(file.values[key]?.trim() ?? ''),
  );
  if (placeholderKeys.length) fail(`.env still has placeholder values for: ${placeholderKeys.join(', ')}.`);

  const expectedAppEnv = environment;
  if (file.values.APP_ENV !== expectedAppEnv) fail(`APP_ENV must be ${expectedAppEnv}.`);

  const expectedBucket = environment === 'stage' ? 'runich-stage' : 'runich-production';
  const expectedPublicUrl =
    environment === 'stage' ? 'https://s3.twcstorage.ru/runich-stage' : 'https://q0tsp3wn9v.cdn.twcstorage.ru';
  const expectedQuarantinePrefix = `moderation-quarantine/${environment}/`;
  if (file.values.S3_BUCKET !== expectedBucket) fail(`S3_BUCKET must be ${expectedBucket}.`);
  const configuredPublicUrl = file.values.S3_PUBLIC_URL?.trim();
  if (configuredPublicUrl && configuredPublicUrl !== expectedPublicUrl) {
    fail(`S3_PUBLIC_URL must be ${expectedPublicUrl}.`);
  }
  if (file.values.S3_QUARANTINE_BUCKET !== 'runich-stage') {
    fail('S3_QUARANTINE_BUCKET must be runich-stage.');
  }
  if (file.values.S3_QUARANTINE_PREFIX !== expectedQuarantinePrefix) {
    fail(`S3_QUARANTINE_PREFIX must be ${expectedQuarantinePrefix}.`);
  }
  const configuredS3Endpoint = file.values.S3_ENDPOINT?.trim();
  if (configuredS3Endpoint !== EXPECTED_S3_ENDPOINT) {
    fail(`S3_ENDPOINT must be ${EXPECTED_S3_ENDPOINT}.`);
  }

  const observeKeys = ['OBSERVE_APP_KEY', 'OBSERVE_APP_SECRET'];
  const configuredObserveKeys = observeKeys.filter((key) => file.values[key]?.trim());
  if (configuredObserveKeys.length === 1) {
    fail('OBSERVE_APP_KEY and OBSERVE_APP_SECRET must either both be set or both be absent.');
  }

  const mailruKeys = ['MAILRU_SMTP_USER', 'MAILRU_SMTP_PASSWORD'];
  const configuredMailruKeys = mailruKeys.filter((key) => file.values[key]?.trim());
  if (configuredMailruKeys.length === 1) {
    fail('MAILRU_SMTP_USER and MAILRU_SMTP_PASSWORD must either both be set or both be absent.');
  }

  const databaseUrl = file.values.DATABASE_URL_DOCKER?.trim();
  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
        fail('DATABASE_URL_DOCKER must be a PostgreSQL URL with a host and database name.');
      }
      if (environment === 'stage' && url.hostname !== 'db') {
        fail('Stage DATABASE_URL_DOCKER must use the Compose host db.');
      }
      if (environment === 'production' && url.hostname === 'db') {
        fail('Production DATABASE_URL_DOCKER must use the external Timeweb database host.');
      }
      if (
        environment === 'stage' &&
        file.values.POSTGRES_DB &&
        decodeURIComponent(url.pathname.slice(1)) !== file.values.POSTGRES_DB
      ) {
        fail('Stage DATABASE_URL_DOCKER database name must match POSTGRES_DB.');
      }
      if (
        environment === 'stage' &&
        file.values.POSTGRES_PASSWORD &&
        decodeURIComponent(url.password) !== file.values.POSTGRES_PASSWORD
      ) {
        fail('Stage DATABASE_URL_DOCKER password must match POSTGRES_PASSWORD.');
      }
    } catch {
      fail('DATABASE_URL_DOCKER is not a valid PostgreSQL URL.');
    }
  }

  if (file.values.S3_PUBLIC_URL?.trim()) {
    try {
      const url = new URL(file.values.S3_PUBLIC_URL);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    } catch {
      fail('S3_PUBLIC_URL must be an absolute HTTP or HTTPS URL when set.');
    }
  }

  const port = file.values.PORT?.trim();
  if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
    fail('PORT must be an integer between 1 and 65535 when set.');
  }

  if (environment === 'stage') {
    const postgresUser = file.values.POSTGRES_USER;
    if (postgresUser && databaseUrl) {
      try {
        if (decodeURIComponent(new URL(databaseUrl).username) !== postgresUser) {
          fail('Stage DATABASE_URL_DOCKER user must match POSTGRES_USER.');
        }
      } catch {
        // Более точная ошибка для DATABASE_URL_DOCKER уже выведена выше.
      }
    }
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--environment') options.environment = args[++index];
    else if (arg === '--file') options.file = args[++index];
    else {
      fail(`unknown argument: ${arg}`);
      return undefined;
    }
  }

  if (!['stage', 'production'].includes(options.environment)) {
    fail('--environment must be stage or production.');
    return undefined;
  }
  if (!options.file) {
    fail('--file must point to the deployment .env file.');
    return undefined;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (options) {
  const envFilePath = resolve(options.file);
  normalizeDeploymentEnv(envFilePath, options.environment);
  if (!process.exitCode) {
    const file = readEnvFile(envFilePath, '.env');
    if (file) {
      try {
        if ((statSync(envFilePath).mode & 0o077) !== 0) fail('.env permissions must be 0600 or stricter.');
      } catch {
        fail('.env permissions could not be checked.');
      }
      validateEnvironment(file, options.environment);
    }
  }
}

if (!process.exitCode) {
  console.log(`[env validation] ${options.environment} .env contains all required keys and environment values.`);
}
