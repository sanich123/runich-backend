import { BadRequestException } from '@nestjs/common';

export interface CommentCursor {
  date: Date;
  id: string;
}

export function encodeCommentCursor({ date, id }: CommentCursor): string {
  return Buffer.from(JSON.stringify({ date: date.toISOString(), id }), 'utf8').toString('base64url');
}

export function parseCommentCursor(cursor?: string): CommentCursor | undefined {
  if (cursor === undefined) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { date?: unknown; id?: unknown };
    if (typeof parsed.date !== 'string' || typeof parsed.id !== 'string' || !parsed.id) {
      throw new Error('Invalid comment cursor');
    }

    const date = new Date(parsed.date);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid comment cursor');

    return { date, id: parsed.id };
  } catch {
    throw new BadRequestException('Некорректный курсор комментариев: cursor');
  }
}
