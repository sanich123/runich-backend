import { cursorPayloadObject, encodeBase64UrlCursor, parseBase64UrlCursor } from 'src/common/utils/base64url-cursor';

export interface ProfileCursor {
  id: string;
}

export function encodeProfileCursor({ id }: ProfileCursor): string {
  return encodeBase64UrlCursor({ id });
}

export function parseProfileCursor(cursor?: string): ProfileCursor | undefined {
  return parseBase64UrlCursor(
    cursor,
    (payload) => {
      const parsed = cursorPayloadObject(payload);
      if (typeof parsed.id !== 'string' || !parsed.id) throw new Error('Invalid profile cursor');
      return { id: parsed.id };
    },
    'Некорректный курсор профилей: cursor',
  );
}
