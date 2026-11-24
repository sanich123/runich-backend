import { cursorPayloadObject, encodeBase64UrlCursor, parseBase64UrlCursor } from 'src/common/utils/base64url-cursor';

export interface LikeCursor {
  date: Date;
  id: string;
}

export function encodeLikeCursor({ date, id }: LikeCursor): string {
  return encodeBase64UrlCursor({ date: date.toISOString(), id });
}

export function parseLikeCursor(cursor?: string): LikeCursor | undefined {
  return parseBase64UrlCursor(
    cursor,
    (payload) => {
      const parsed = cursorPayloadObject(payload);
      if (typeof parsed.date !== 'string' || typeof parsed.id !== 'string' || !parsed.id) {
        throw new Error('Invalid like cursor');
      }

      const date = new Date(parsed.date);
      if (Number.isNaN(date.getTime())) throw new Error('Invalid like cursor');

      return { date, id: parsed.id };
    },
    'Invalid likes cursor',
  );
}
