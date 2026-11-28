import { S3_REGION } from './const';
import type { StorageSettings } from './types';

export const LEGACY_PUBLIC_STORAGE_URL_BASES = ['https://q0tsp3wn9v.cdn.twcstorage.ru'] as const;

function requireStorageSetting(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadStorageSettings(): StorageSettings {
  const endpoint = requireStorageSetting('S3_ENDPOINT').replace(/\/+$/, '');
  try {
    const parsedEndpoint = new URL(endpoint);
    if (!['http:', 'https:'].includes(parsedEndpoint.protocol)) throw new Error();
  } catch {
    throw new Error('S3_ENDPOINT must be an absolute HTTP or HTTPS URL');
  }

  const rawQuarantinePrefix = requireStorageSetting('S3_QUARANTINE_PREFIX').replace(/^\/+|\/+$/g, '');
  if (rawQuarantinePrefix.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('S3_QUARANTINE_PREFIX contains an invalid path segment');
  }

  return {
    endpoint,
    region: S3_REGION,
    bucket: requireStorageSetting('S3_BUCKET'),
    quarantineBucket: requireStorageSetting('S3_QUARANTINE_BUCKET'),
    quarantinePrefix: `${rawQuarantinePrefix}/`,
    accessKey: requireStorageSetting('S3_ACCESS_KEY'),
    secretKey: requireStorageSetting('S3_SECRET_ACCESS_KEY'),
  };
}
