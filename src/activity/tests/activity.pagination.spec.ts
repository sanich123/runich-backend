import { BadRequestException } from '@nestjs/common';

import {
  encodeActivityCursor,
  encodeActivityMediaCursor,
  parseActivityCursor,
  parseActivityMediaCursor,
} from '../activity.pagination';

describe('activity pagination', () => {
  const date = new Date('2026-09-09T12:00:00.000Z');

  it('returns undefined when a cursor is not provided', () => {
    expect(parseActivityCursor()).toBeUndefined();
    expect(parseActivityMediaCursor()).toBeUndefined();
  });

  it('round-trips activity and media cursors', () => {
    expect(parseActivityCursor(encodeActivityCursor({ date, id: 'activity-1' }))).toEqual({
      date,
      id: 'activity-1',
    });
    expect(parseActivityMediaCursor(encodeActivityMediaCursor({ date, id: 'activity-1', photoIndex: 2 }))).toEqual({
      date,
      id: 'activity-1',
      photoIndex: 2,
    });
  });

  it.each([
    JSON.stringify({ date: date.toISOString(), id: '' }),
    JSON.stringify({ date: 'not-a-date', id: 'activity-1' }),
    'not-json',
  ])('rejects an invalid activity cursor: %s', (value) => {
    const cursor = Buffer.from(value).toString('base64url');

    expect(() => parseActivityCursor(cursor)).toThrow(BadRequestException);
  });

  it.each([
    JSON.stringify({ date: date.toISOString(), id: 'activity-1', photoIndex: -1 }),
    JSON.stringify({ date: date.toISOString(), id: 'activity-1', photoIndex: 1.5 }),
    JSON.stringify({ date: date.toISOString(), id: 'activity-1' }),
  ])('rejects an invalid media cursor: %s', (value) => {
    const cursor = Buffer.from(value).toString('base64url');

    expect(() => parseActivityMediaCursor(cursor)).toThrow(BadRequestException);
  });
});
