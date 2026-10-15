import { BadRequestException } from '@nestjs/common';
import { encodeNotificationCursor, parseNotificationCursor } from '../notification.pagination';

describe('notification pagination cursor', () => {
  it('round-trips a cursor and omits an absent cursor', () => {
    const cursor = { createdAt: new Date('2026-10-14T10:00:00.000Z'), id: 'notification-1' };
    expect(parseNotificationCursor()).toBeUndefined();
    expect(parseNotificationCursor(encodeNotificationCursor(cursor))).toEqual(cursor);
  });

  it.each([
    'not-json',
    Buffer.from(JSON.stringify({ createdAt: '2026-10-14T10:00:00.000Z' })).toString('base64url'),
    Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: 'notification-1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ createdAt: '2026-10-14T10:00:00.000Z', id: '' })).toString('base64url'),
  ])('rejects malformed cursor %s', (cursor) => {
    expect(() => parseNotificationCursor(cursor)).toThrow(BadRequestException);
  });
});
