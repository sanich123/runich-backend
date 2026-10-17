import { parseProfileCursor } from '../account.pagination';

describe('parseProfileCursor', () => {
  it('returns undefined when the initial page has no cursor', () => {
    expect(parseProfileCursor()).toBeUndefined();
  });
});
