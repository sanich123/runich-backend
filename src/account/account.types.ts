export type ProfilePhotoReviewStatus = 'queued' | 'processing' | 'review_required';

export type ProfileSearchProfile = {
  id: string;
  userId: string;
  name: string | null;
  surname: string | null;
  city: string | null;
  profilePhoto: string | null;
  profilePhotoBlurhash: string | null;
  profilePhotoPendingAssetId: string | null;
  profilePhotoPendingBlurhash: string | null;
  allowNewFollowers: boolean;
};

export type ProfilePhotoModerationAsset = {
  id: string;
  ownerId: string;
  status: ProfilePhotoReviewStatus | 'approved' | 'rejected' | 'failed';
  publishedKey: string | null;
};
