import { parseProfileCursor } from '../account.pagination';

describe('parseProfileCursor', () => {
  it('returns undefined when the initial page has no cursor', () => {
    expect(parseProfileCursor()).toBeUndefined();
  });

  it('rejects a cursor payload without a string profile id', () => {
    const cursor = Buffer.from(JSON.stringify({ id: 1 }), 'utf8').toString('base64url');

    expect(() => parseProfileCursor(cursor)).toThrow('Некорректный курсор профилей: cursor');
  });
});
