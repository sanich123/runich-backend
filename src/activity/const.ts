import { PATHS } from 'src/common/constants';

export const { activity, id } = PATHS;

export const DEFAULT_ACTIVITY_PAGE_SIZE = 20;
export const MEDIA_ACTIVITY_BATCH_SIZE = 50;

export const ACTIVITY_CARD_PROFILE_SELECT = {
  surname: true,
  name: true,
  profilePhoto: true,
  profilePhotoBlurhash: true,
  emailNotifications: true,
} as const;

export const ACTIVITY_FEED_PROFILE_SELECT = {
  ...ACTIVITY_CARD_PROFILE_SELECT,
  user: { select: { email: true } },
} as const;

export const ACTIVITY_CARD_SELECT = {
  title: true,
  date: true,
  sport: true,
  id: true,
  userId: true,
  photoVideoUrls: true,
  mapPhotoUrl: true,
  mapPhotoUrlBlurhash: true,
  duration: true,
  distance: true,
  steps: true,
  profile: { select: ACTIVITY_CARD_PROFILE_SELECT },
  _count: { select: { comments: true } },
} as const;

export const ACTIVITY_FEED_SELECT = {
  ...ACTIVITY_CARD_SELECT,
  profile: { select: ACTIVITY_FEED_PROFILE_SELECT },
} as const;
