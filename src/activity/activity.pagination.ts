import { BadRequestException } from '@nestjs/common';

export interface ActivityCursor {
  date: Date;
  id: string;
}

export interface ActivityMediaCursor extends ActivityCursor {
  photoIndex: number;
}

function parseCursor<T extends ActivityCursor>(
  cursor: string | undefined,
  label: string,
  withPhotoIndex = false,
): T | undefined {
  if (cursor === undefined) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      date?: unknown;
      id?: unknown;
      photoIndex?: unknown;
    };
    if (typeof parsed.date !== 'string' || typeof parsed.id !== 'string' || !parsed.id) {
      throw new Error('Invalid activity cursor');
    }

    const date = new Date(parsed.date);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid activity cursor');

    if (withPhotoIndex && (!Number.isSafeInteger(parsed.photoIndex) || (parsed.photoIndex as number) < 0)) {
      throw new Error('Invalid activity media cursor');
    }

    return {
      date,
      id: parsed.id,
      ...(withPhotoIndex ? { photoIndex: parsed.photoIndex as number } : {}),
    } as T;
  } catch {
    throw new BadRequestException(`Некорректный курсор ${label}: cursor`);
  }
}

export function encodeActivityCursor({ date, id }: ActivityCursor): string {
  return Buffer.from(JSON.stringify({ date: date.toISOString(), id }), 'utf8').toString('base64url');
}

export function parseActivityCursor(cursor?: string): ActivityCursor | undefined {
  return parseCursor<ActivityCursor>(cursor, 'активностей');
}

export function encodeActivityMediaCursor({ date, id, photoIndex }: ActivityMediaCursor): string {
  return Buffer.from(JSON.stringify({ date: date.toISOString(), id, photoIndex }), 'utf8').toString('base64url');
}

export function parseActivityMediaCursor(cursor?: string): ActivityMediaCursor | undefined {
  return parseCursor<ActivityMediaCursor>(cursor, 'медиагалереи', true);
}
