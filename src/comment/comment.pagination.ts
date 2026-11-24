import { cursorPayloadObject, encodeBase64UrlCursor, parseBase64UrlCursor } from 'src/common/utils/base64url-cursor';

export interface CommentCursor {
  date: Date;
  id: string;
}

export function encodeCommentCursor({ date, id }: CommentCursor): string {
  return encodeBase64UrlCursor({ date: date.toISOString(), id });
}

export function parseCommentCursor(cursor?: string): CommentCursor | undefined {
  return parseBase64UrlCursor(
    cursor,
    (payload) => {
      const parsed = cursorPayloadObject(payload);
      if (typeof parsed.date !== 'string' || typeof parsed.id !== 'string' || !parsed.id) {
        throw new Error('Invalid comment cursor');
      }

      const date = new Date(parsed.date);
      if (Number.isNaN(date.getTime())) throw new Error('Invalid comment cursor');

      return { date, id: parsed.id };
    },
    'Некорректный курсор комментариев: cursor',
  );
}
