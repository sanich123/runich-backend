import { getGroupPhotoReviewStatus } from '../shared/groups.utils';

describe('getGroupPhotoReviewStatus', () => {
  it.each(['queued', 'processing', 'review_required'] as const)('returns the pending status %s', (status) => {
    expect(getGroupPhotoReviewStatus({ status, publishedKey: null })).toBe(status);
  });

  it('keeps approved photos pending until they have a published key', () => {
    expect(getGroupPhotoReviewStatus({ status: 'approved', publishedKey: null })).toBe('approved');
    expect(getGroupPhotoReviewStatus({ status: 'approved', publishedKey: 'groups/photo.webp' })).toBeNull();
  });

  it.each([null, undefined, 'failed', 'rejected'])('returns no pending status for %s', (status) => {
    expect(getGroupPhotoReviewStatus(status === null || status === undefined ? null : { status })).toBeNull();
  });
});
