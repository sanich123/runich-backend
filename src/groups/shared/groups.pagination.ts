import { cursorPayloadObject, encodeBase64UrlCursor, parseBase64UrlCursor } from 'src/common/utils/base64url-cursor';

export const GROUP_PAGE_SIZE = 100;

export interface GroupDateCursor {
  date: Date;
  id: string;
}

export interface GroupDistanceCursor {
  totalDistance: number;
  userId: string;
}

export interface GroupPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function createGroupPage<T>(rows: T[], pageSize: number, encodeCursor: (lastRow: T) => string): GroupPage<T> {
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const lastItem = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && lastItem ? encodeCursor(lastItem) : null,
  };
}

export function encodeGroupDateCursor({ date, id }: GroupDateCursor) {
  return encodeBase64UrlCursor({ date: date.toISOString(), id });
}

export function parseGroupDateCursor(cursor?: string): GroupDateCursor | undefined {
  return parseBase64UrlCursor(
    cursor,
    (payload) => {
      const parsed = cursorPayloadObject(payload);
      if (typeof parsed.date !== 'string' || typeof parsed.id !== 'string' || !parsed.id) {
        throw new Error('Invalid group date cursor');
      }
      const date = new Date(parsed.date);
      if (Number.isNaN(date.getTime())) throw new Error('Invalid group date cursor');
      return { date, id: parsed.id };
    },
    'Некорректный курсор группы: cursor',
  );
}

export function encodeGroupDistanceCursor(cursor: GroupDistanceCursor) {
  return encodeBase64UrlCursor(cursor);
}

export function parseGroupDistanceCursor(cursor?: string): GroupDistanceCursor | undefined {
  return parseBase64UrlCursor(
    cursor,
    (payload) => {
      const parsed = cursorPayloadObject(payload);
      if (
        typeof parsed.totalDistance !== 'number' ||
        !Number.isFinite(parsed.totalDistance) ||
        typeof parsed.userId !== 'string' ||
        !parsed.userId
      ) {
        throw new Error('Invalid group distance cursor');
      }
      return { totalDistance: parsed.totalDistance, userId: parsed.userId };
    },
    'Некорректный курсор пробега группы: cursor',
  );
}
