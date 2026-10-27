import { makePendingAvatarProfile } from 'src/tests/fixtures/profile.fixtures';

export function makeAccountPage<T>(items: T[]) {
  return { items, hasMore: false, nextCursor: null };
}

export function makeSearchProfileWithPendingReplacement() {
  return makePendingAvatarProfile({
    userId: 'user-1',
    profilePhoto: 'https://cdn.example/approved.jpg',
    profilePhotoBlurhash: 'approved-blurhash',
    profilePhotoPendingBlurhash: 'pending-blurhash',
  });
}

export function makeSearchProfileWithFirstPendingPhoto() {
  return makePendingAvatarProfile({
    userId: 'user-1',
    profilePhoto: null,
    profilePhotoBlurhash: null,
    profilePhotoPendingBlurhash: 'pending-blurhash',
  });
}

type ReviewRequiredAssetFixture = {
  id: string;
  ownerId: string;
  status: 'review_required';
  publishedKey: string | null;
};

export function makeReviewRequiredProfilePhotoAsset(overrides: Partial<ReviewRequiredAssetFixture> = {}) {
  return {
    id: 'asset-1',
    ownerId: 'user-1',
    status: 'review_required' as const,
    publishedKey: null,
    ...overrides,
  };
}
