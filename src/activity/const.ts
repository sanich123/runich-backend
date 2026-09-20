import { PATHS } from 'src/common/constants';

export const { activity, id } = PATHS;

export const DEFAULT_ACTIVITY_PAGE_SIZE = 20;

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
  timeZone: true,
  sport: true,
  emotion: true,
  id: true,
  userId: true,
  visibility: true,
  media: {
    select: { url: true, thumbnail: true, blurhash: true },
    orderBy: { position: 'asc' },
  },
  mapPhotoUrl: true,
  mapPhotoUrlBlurhash: true,
  locationName: true,
  weatherTemperature: true,
  weatherWindSpeed: true,
  weatherCode: true,
  caloriesActive: true,
  duration: true,
  distance: true,
  elevationGain: true,
  steps: true,
  kilometresSplit: true,
  profile: { select: ACTIVITY_CARD_PROFILE_SELECT },
  _count: { select: { comments: true, likes: true } },
} as const;

export const ACTIVITY_FEED_SELECT = {
  ...ACTIVITY_CARD_SELECT,
  profile: { select: ACTIVITY_FEED_PROFILE_SELECT },
} as const;

export const ACTIVITY_DETAILS_SELECT = {
  ...ACTIVITY_FEED_SELECT,
  description: true,
  visibility: true,
  emotion: true,
  kilometresSplit: true,
} as const;
