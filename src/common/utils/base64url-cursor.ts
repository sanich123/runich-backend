import { BadRequestException } from '@nestjs/common';

export function encodeBase64UrlCursor(payload: object): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function parseBase64UrlCursor<T>(
  cursor: string | undefined,
  decode: (payload: unknown) => T,
  invalidMessage: string,
): T | undefined {
  if (cursor === undefined) return undefined;

  try {
    const payload: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return decode(payload);
  } catch {
    throw new BadRequestException(invalidMessage);
  }
}

export function cursorPayloadObject(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new Error('Invalid cursor payload');
  }
  return payload;
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}
