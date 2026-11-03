import { BadRequestException } from '@nestjs/common';

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
  return Buffer.from(JSON.stringify({ date: date.toISOString(), id }), 'utf8').toString('base64url');
}

export function parseGroupDateCursor(cursor?: string): GroupDateCursor | undefined {
  if (cursor === undefined) return undefined;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('date' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.date !== 'string' ||
      typeof parsed.id !== 'string' ||
      !parsed.id
    ) {
      throw new Error('Invalid group date cursor');
    }
    const date = new Date(parsed.date);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid group date cursor');
    return { date, id: parsed.id };
  } catch {
    throw new BadRequestException('Некорректный курсор группы: cursor');
  }
}

export function encodeGroupDistanceCursor(cursor: GroupDistanceCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function parseGroupDistanceCursor(cursor?: string): GroupDistanceCursor | undefined {
  if (cursor === undefined) return undefined;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('totalDistance' in parsed) ||
      !('userId' in parsed) ||
      typeof parsed.totalDistance !== 'number' ||
      !Number.isFinite(parsed.totalDistance) ||
      typeof parsed.userId !== 'string' ||
      !parsed.userId
    ) {
      throw new Error('Invalid group distance cursor');
    }
    return { totalDistance: parsed.totalDistance, userId: parsed.userId };
  } catch {
    throw new BadRequestException('Некорректный курсор пробега группы: cursor');
  }
}
