import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import {
  encodeGroupDateCursor,
  encodeGroupDistanceCursor,
  createGroupPage,
  parseGroupDateCursor,
  parseGroupDistanceCursor,
} from '../shared/groups.pagination';

describe('group pagination cursors', () => {
  it('creates a lookahead page with a cursor from the last visible row', () => {
    const rows = [{ id: 'first' }, { id: 'second' }, { id: 'lookahead' }];

    expect(createGroupPage(rows, 2, ({ id }) => id)).toEqual({
      items: rows.slice(0, 2),
      hasMore: true,
      nextCursor: 'second',
    });
  });

  it('creates an empty terminal page without requesting a cursor', () => {
    const encodeCursor = jest.fn(() => 'unused');

    expect(createGroupPage([], 10, encodeCursor)).toEqual({ items: [], hasMore: false, nextCursor: null });
    expect(encodeCursor).not.toHaveBeenCalled();
  });

  it('round-trips date cursors and leaves an omitted cursor undefined', () => {
    const cursor = { date: new Date('2026-10-29T10:00:00.000Z'), id: 'item-42' };

    expect(parseGroupDateCursor()).toBeUndefined();
    expect(parseGroupDateCursor(encodeGroupDateCursor(cursor))).toEqual(cursor);
  });

  it.each([
    'not-json',
    Buffer.from(JSON.stringify({})).toString('base64url'),
    Buffer.from(JSON.stringify({ date: 'not-a-date', id: 'item-1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ date: '2026-10-29T10:00:00.000Z', id: '' })).toString('base64url'),
  ])('rejects an invalid date cursor: %s', (cursor) => {
    expect(() => parseGroupDateCursor(cursor)).toThrow(BadRequestException);
  });

  it('round-trips distance cursors and leaves an omitted cursor undefined', () => {
    const cursor = { totalDistance: 12500, userId: 'runner-42' };

    expect(parseGroupDistanceCursor()).toBeUndefined();
    expect(parseGroupDistanceCursor(encodeGroupDistanceCursor(cursor))).toEqual(cursor);
  });

  it.each([
    'not-json',
    Buffer.from(JSON.stringify({})).toString('base64url'),
    Buffer.from('{"totalDistance":1e400,"userId":"runner-1"}').toString('base64url'),
    Buffer.from(JSON.stringify({ totalDistance: 12, userId: '' })).toString('base64url'),
  ])('rejects an invalid distance cursor: %s', (cursor) => {
    expect(() => parseGroupDistanceCursor(cursor)).toThrow(BadRequestException);
  });
});
