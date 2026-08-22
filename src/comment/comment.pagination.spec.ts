import { BadRequestException } from '@nestjs/common';
import { encodeCommentCursor, parseCommentCursor } from './comment.pagination';

describe('comment pagination cursors', () => {
  it('encodes and decodes a cursor', () => {
    const cursor = encodeCommentCursor({ date: new Date('2026-08-22T10:00:00.000Z'), id: 'comment-1' });

    expect(parseCommentCursor(cursor)).toEqual({
      date: new Date('2026-08-22T10:00:00.000Z'),
      id: 'comment-1',
    });
  });

  it('returns undefined when no cursor is supplied', () => {
    expect(parseCommentCursor()).toBeUndefined();
  });

  it.each([
    Buffer.from('{}').toString('base64url'),
    Buffer.from(JSON.stringify({ date: 'bad-date', id: 'comment-1' })).toString('base64url'),
    'not-base64-json',
  ])('rejects an invalid cursor', (cursor) => {
    expect(() => parseCommentCursor(cursor)).toThrow(BadRequestException);
  });
});
