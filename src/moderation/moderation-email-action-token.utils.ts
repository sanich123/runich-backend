import { createHmac, timingSafeEqual } from 'node:crypto';
import { getApiBaseUrl, getJwtSecret } from 'src/common/config/environment';
import type { ModerationEmailAction, ModerationEmailActionToken } from './moderation-email-actions.types';

const EMAIL_ACTION_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_PURPOSE = 'runich:moderation-email-action:v1';
const EMAIL_ACTIONS = [
  'hide_content',
  'remove_content',
  'restore_content',
  'warn_user',
  'temporary_suspend',
  'permanent_suspend',
  'reject_report',
  'approve_media',
  'reject_media',
] satisfies ModerationEmailAction[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isModerationEmailAction(value: unknown): value is ModerationEmailAction {
  return typeof value === 'string' && EMAIL_ACTIONS.some((action) => action === value);
}

function getSigningKey() {
  return createHmac('sha256', getJwtSecret()).update(TOKEN_PURPOSE).digest();
}

function signTokenPayload(encodedPayload: string) {
  return createHmac('sha256', getSigningKey()).update(encodedPayload).digest('base64url');
}

export function createModerationEmailActionToken(reportId: string, action: ModerationEmailAction): string {
  const payload: ModerationEmailActionToken = {
    reportId,
    action,
    expiresAt: Math.floor(Date.now() / 1000) + EMAIL_ACTION_EXPIRY_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${signTokenPayload(encodedPayload)}`;
}

export function verifyModerationEmailActionToken(token: string): ModerationEmailActionToken | null {
  if (token.length > 2048) return null;
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) return null;

  const encodedPayload = token.slice(0, separator);
  const receivedSignature = Buffer.from(token.slice(separator + 1), 'base64url');
  const expectedSignature = Buffer.from(signTokenPayload(encodedPayload), 'base64url');
  if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isRecord(payload)) return null;

  if (
    typeof payload.reportId !== 'string' ||
    payload.reportId.length === 0 ||
    payload.reportId.length > 100 ||
    !isModerationEmailAction(payload.action) ||
    typeof payload.expiresAt !== 'number' ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return {
    reportId: payload.reportId,
    action: payload.action,
    expiresAt: payload.expiresAt,
  };
}

export function getModerationEmailActionUrl(reportId: string, action: ModerationEmailAction) {
  const token = createModerationEmailActionToken(reportId, action);
  return `${getApiBaseUrl()}/moderation/email-actions/${token}`;
}
