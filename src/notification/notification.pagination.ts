import { BadRequestException } from '@nestjs/common';
import { NOTIFICATION_ERROR_MESSAGE } from './notification.constants';
import type { NotificationCursor, NotificationCursorPayload } from './notification.types';

export function encodeNotificationCursor({ createdAt, id }: NotificationCursor) {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), 'utf8').toString('base64url');
}

export function parseNotificationCursor(cursor?: string): NotificationCursor | undefined {
  if (cursor === undefined) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as NotificationCursorPayload;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string' || !parsed.id) {
      throw new Error('Invalid notification cursor');
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error('Invalid notification cursor');
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException(NOTIFICATION_ERROR_MESSAGE.invalidCursor);
  }
}
