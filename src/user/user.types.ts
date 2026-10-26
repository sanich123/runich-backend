export type ProfilePhotoReviewStage = 'queued' | 'processing' | 'review_required';

export interface ProfileWithPendingPhoto {
  userId: string;
  profilePhoto: string | null;
  profilePhotoBlurhash: string | null;
  profilePhotoPendingAssetId: string | null;
  profilePhotoPendingBlurhash: string | null;
}
