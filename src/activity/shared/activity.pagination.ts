import { cursorPayloadObject, encodeBase64UrlCursor, parseBase64UrlCursor } from 'src/common/utils/base64url-cursor';

export interface ActivityCursor {
  date: Date;
  id: string;
}

export interface ActivityMediaCursor extends ActivityCursor {
  photoIndex: number;
}

function parseDateAndId(payload: unknown): ActivityCursor {
  const parsed = cursorPayloadObject(payload);
  if (typeof parsed.date !== 'string' || typeof parsed.id !== 'string' || !parsed.id) {
    throw new Error('Invalid activity cursor');
  }

  const date = new Date(parsed.date);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid activity cursor');
  return { date, id: parsed.id };
}

export function encodeActivityCursor({ date, id }: ActivityCursor): string {
  return encodeBase64UrlCursor({ date: date.toISOString(), id });
}

export function parseActivityCursor(cursor?: string): ActivityCursor | undefined {
  return parseBase64UrlCursor(cursor, parseDateAndId, 'Некорректный курсор активностей: cursor');
}

export function encodeActivityMediaCursor({ date, id, photoIndex }: ActivityMediaCursor): string {
  return encodeBase64UrlCursor({ date: date.toISOString(), id, photoIndex });
}

export function parseActivityMediaCursor(cursor?: string): ActivityMediaCursor | undefined {
  return parseBase64UrlCursor(
    cursor,
    (payload) => {
      const parsed = cursorPayloadObject(payload);
      const base = parseDateAndId(payload);
      if (!Number.isSafeInteger(parsed.photoIndex) || typeof parsed.photoIndex !== 'number' || parsed.photoIndex < 0) {
        throw new Error('Invalid activity media cursor');
      }
      return { ...base, photoIndex: parsed.photoIndex };
    },
    'Некорректный курсор медиагалереи: cursor',
  );
}
