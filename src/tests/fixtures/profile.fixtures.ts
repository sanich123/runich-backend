type BasicProfileFixture = {
  id: string;
  userId: string;
  name: string;
};

export function makeBasicProfile(overrides: Partial<BasicProfileFixture> = {}) {
  return {
    id: 'profile-1',
    userId: 'user-1',
    name: 'Ann',
    ...overrides,
  };
}

type ProfileSummaryFixture = {
  name: string;
  surname: string;
  profilePhoto: string;
  bio?: string;
};

export function makeProfileSummary(overrides: Partial<ProfileSummaryFixture> = {}) {
  return {
    name: 'Alice',
    surname: 'Runner',
    profilePhoto: 'avatar.jpg',
    ...overrides,
  };
}

type ProfileNameFixture = {
  name: string | null;
  surname: string | null;
};

export function makeProfileName(overrides: Partial<ProfileNameFixture> = {}) {
  return { name: 'Ann', surname: 'Runner', ...overrides };
}

type PendingAvatarProfileFixture = {
  id: string;
  userId: string;
  profilePhoto: string | null;
  profilePhotoBlurhash: string | null;
  profilePhotoPendingAssetId: string | null;
  profilePhotoPendingBlurhash: string | null;
};

export function makePendingAvatarProfile(overrides: Partial<PendingAvatarProfileFixture> = {}) {
  return {
    id: 'profile-1',
    userId: 'owner-1',
    profilePhoto: 'https://public.example.test/old-avatar.webp',
    profilePhotoBlurhash: 'old-hash',
    profilePhotoPendingAssetId: 'asset-1',
    profilePhotoPendingBlurhash: 'pending-hash',
    ...overrides,
  };
}
