import { getAuthenticatedUserId } from '../request/auth-request';

describe('getAuthenticatedUserId', () => {
  it('prefers the JWT userId claim', () => {
    expect(getAuthenticatedUserId({ user: { id: 'id', userId: 'user-id' } } as never)).toBe('user-id');
  });

  it('falls back to the authenticated request id', () => {
    expect(getAuthenticatedUserId({ user: { id: 'id' } } as never)).toBe('id');
  });
});
