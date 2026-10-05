import { BadRequestException } from '@nestjs/common';
import { encodeLikeCursor, parseLikeCursor } from '../like.pagination';

describe('like pagination cursor', () => {
  it('round-trips the date and id', () => {
    const cursor = encodeLikeCursor({ date: new Date('2026-08-22T10:00:00.000Z'), id: 'like-1' });

    expect(parseLikeCursor(cursor)).toEqual({ date: new Date('2026-08-22T10:00:00.000Z'), id: 'like-1' });
  });

  it('accepts an omitted cursor', () => {
    expect(parseLikeCursor()).toBeUndefined();
  });

  it.each([
    'not-base64-json',
    Buffer.from(JSON.stringify({ date: 'not-a-date', id: 'like-1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ date: '2026-08-22T10:00:00.000Z', id: '' })).toString('base64url'),
  ])('rejects an invalid cursor', (cursor) => {
    expect(() => parseLikeCursor(cursor)).toThrow(BadRequestException);
  });
});
