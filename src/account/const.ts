export const DEFAULT_PROFILE_PAGE_SIZE = 10;

export const PROFILE_SEARCH_SELECT = {
  id: true,
  userId: true,
  name: true,
  surname: true,
  city: true,
  profilePhoto: true,
  profilePhotoBlurhash: true,
  profilePhotoPendingAssetId: true,
  profilePhotoPendingBlurhash: true,
  allowNewFollowers: true,
} as const;

export const PUBLIC_USER_PROFILE_SELECT = {
  id: true,
  userId: true,
  createdAt: true,
  name: true,
  bio: true,
  city: true,
  profilePhoto: true,
  sport: true,
  surname: true,
  updatedAt: true,
  language: true,
  profilePhotoBlurhash: true,
  allowActivityInteractions: true,
  allowActivityReplayViewing: true,
  allowActivityHeartRateViewing: true,
  allowActivityElevationViewing: true,
  allowActivityPaceViewing: true,
  allowActivitySharing: true,
  hideActivityStatistics: true,
  hideFollowingList: true,
  hideProfilePhotos: true,
  allowNewFollowers: true,
} as const;
