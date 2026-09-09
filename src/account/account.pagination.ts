import { BadRequestException } from '@nestjs/common';

export interface ProfileCursor {
  id: string;
}

export function encodeProfileCursor({ id }: ProfileCursor): string {
  return Buffer.from(JSON.stringify({ id }), 'utf8').toString('base64url');
}

export function parseProfileCursor(cursor?: string): ProfileCursor | undefined {
  if (cursor === undefined) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { id?: unknown };
    if (typeof parsed.id !== 'string' || !parsed.id) throw new Error('Invalid profile cursor');
    return { id: parsed.id };
  } catch {
    throw new BadRequestException('Некорректный курсор профилей: cursor');
  }
}
