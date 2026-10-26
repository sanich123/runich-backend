import { createHash } from 'node:crypto';
import { SESSION_METADATA_LIMITS } from '../constants/auth.constants';
import type { SessionMetadata } from '../types/auth.types';

export function normalizeSessionMetadata(metadata: SessionMetadata) {
  return {
    deviceId: truncate(metadata.deviceId ?? 'unknown', SESSION_METADATA_LIMITS.deviceId) ?? 'unknown',
    deviceName: truncate(metadata.deviceName, SESSION_METADATA_LIMITS.deviceName),
    platform: truncate(metadata.platform, SESSION_METADATA_LIMITS.platform),
    model: truncate(metadata.model, SESSION_METADATA_LIMITS.model),
    manufacturer: truncate(metadata.manufacturer, SESSION_METADATA_LIMITS.manufacturer),
    osName: truncate(metadata.osName, SESSION_METADATA_LIMITS.osName),
    osVersion: truncate(metadata.osVersion, SESSION_METADATA_LIMITS.osVersion),
    deviceType: truncate(metadata.deviceType, SESSION_METADATA_LIMITS.deviceType),
    appVersion: truncate(metadata.appVersion, SESSION_METADATA_LIMITS.appVersion),
    appBuild: truncate(metadata.appBuild, SESSION_METADATA_LIMITS.appBuild),
    userAgent: truncate(metadata.userAgent, SESSION_METADATA_LIMITS.userAgent),
    ipAddress: truncate(metadata.ipAddress, SESSION_METADATA_LIMITS.ipAddress),
  };
}

function truncate(value: string | null | undefined, maxLength: number) {
  if (value === null || value === undefined) return value;
  return Array.from(value).slice(0, maxLength).join('');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
