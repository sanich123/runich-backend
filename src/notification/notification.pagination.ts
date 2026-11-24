import { cursorPayloadObject, encodeBase64UrlCursor, parseBase64UrlCursor } from 'src/common/utils/base64url-cursor';
import { NOTIFICATION_ERROR_MESSAGE } from './notification.constants';
import type { NotificationCursor } from './notification.types';

export function encodeNotificationCursor({ createdAt, id }: NotificationCursor) {
  return encodeBase64UrlCursor({ createdAt: createdAt.toISOString(), id });
}

export function parseNotificationCursor(cursor?: string): NotificationCursor | undefined {
  return parseBase64UrlCursor(
    cursor,
    (payload) => {
      const parsed = cursorPayloadObject(payload);
      if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string' || !parsed.id) {
        throw new Error('Invalid notification cursor');
      }
      const createdAt = new Date(parsed.createdAt);
      if (Number.isNaN(createdAt.getTime())) throw new Error('Invalid notification cursor');
      return { createdAt, id: parsed.id };
    },
    NOTIFICATION_ERROR_MESSAGE.invalidCursor,
  );
}
