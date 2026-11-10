export type Membership = {
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'rejected';
  notificationPreference?: 'all' | 'announcements' | 'off';
  feedPreference?: 'all' | 'admins';
};

export type GroupMemberListItem = {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'rejected';
  joinedAt: Date | string | null;
  profile: {
    name: string | null;
    surname: string | null;
    city: string | null;
    profilePhoto: string | null;
  } | null;
};

export type GroupMemberQueryRow = {
  id: string;
  requestedAt: Date | string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'rejected';
  joinedAt: Date | string | null;
  user?: {
    profile?: {
      name: string | null;
      surname: string | null;
      city: string | null;
      profilePhoto: string | null;
      hideProfilePhotos: boolean | null;
      profileSearchVisible: boolean | null;
    } | null;
  } | null;
};

export type GroupPhotoReviewStatus = 'queued' | 'processing' | 'review_required' | 'approved' | null;

export type GroupPostListItem = {
  id: string;
  text: string;
  createdAt: Date | string;
  author: { userId: string; name: string | null; profilePhoto: string | null } | null;
  photoUrl: string | null;
  photoPreviewUrl?: string | null;
  photoBlurhash?: string | null;
  photoReviewStatus?: GroupPhotoReviewStatus;
  hasPhoto?: boolean;
  photoPending?: boolean;
};

export type GroupPostQueryRow = {
  id: string;
  createdByUserId: string;
  text: string;
  createdAt: Date | string;
  photoAssetId: string | null;
  author?: {
    id: string;
    profile?: {
      name: string | null;
      surname: string | null;
      profilePhoto: string | null;
      hideProfilePhotos: boolean | null;
    } | null;
  } | null;
  photoAsset?: { status: string; publishedKey: string | null; blurhash: string | null } | null;
};

export type GroupEventListItem = {
  id: string;
  createdAt: Date | string;
  groupId: string;
  createdByUserId: string;
  title: string;
  description: string | null;
  locationName: string | null;
  sport: string | null;
  distanceKm: number | null;
  startsAt: Date | string;
};
export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  sports: string[];
  categoryTags?: string[];
  photoAssetId?: string | null;
  photoAsset?: { status: string; publishedKey: string | null; blurhash: string | null } | null;
  moderationStatus?: 'visible' | 'hidden' | 'removed';
  privacy: 'open' | 'closed';
  locationName: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdByUserId: string;
  members?: Membership[];
  _count?: { members?: number };
};
