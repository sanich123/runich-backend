import { BadRequestException } from '@nestjs/common';

export interface LikeCursor {
  date: Date;
  id: string;
}

export function encodeLikeCursor({ date, id }: LikeCursor): string {
  return Buffer.from(JSON.stringify({ date: date.toISOString(), id }), 'utf8').toString('base64url');
}

export function parseLikeCursor(cursor?: string): LikeCursor | undefined {
  if (cursor === undefined) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { date?: unknown; id?: unknown };
    if (typeof parsed.date !== 'string' || typeof parsed.id !== 'string' || !parsed.id) {
      throw new Error('Invalid like cursor');
    }

    const date = new Date(parsed.date);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid like cursor');

    return { date, id: parsed.id };
  } catch {
    throw new BadRequestException('Invalid likes cursor');
  }
}
