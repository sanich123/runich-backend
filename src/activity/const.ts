import { PATHS } from 'src/common/constants';

export const { activity, id } = PATHS;

export const ACTIVITY_FAVORITES_ROUTE = 'favorites';
export const ACTIVITY_WITH_ROUTES_ROUTE = 'with-routes';
export const ACTIVITY_HOME_ROUTE = 'home';
export const ACTIVITY_FAVORITE_ROUTE = `${id}/favorite`;
export const ACTIVITY_FAVORITE_API_COPY = {
  listSummary: 'Get the current user favorite activities',
  updateSummary: 'Set favorite state for an activity owned by the current user',
  updateDescription: 'Favorite state updated',
} as const;
export const ACTIVITY_FAVORITE_ERROR_MESSAGES = {
  notFound: 'Активность не найдена',
  forbidden: 'Недостаточно прав',
} as const;

export const DEFAULT_ACTIVITY_PAGE_SIZE = 20;

// The map needs the shape of the route, not every recorded GPS sample. Keep
// the full route in object storage, but send a smaller representation to the
// map endpoint so the response and Mapbox source stay responsive.
export const MAX_MAP_ROUTE_LOCATIONS = 1_000;

const ACTIVITY_CARD_PROFILE_SELECT = {
  userId: true,
  surname: true,
  name: true,
  profilePhoto: true,
  profilePhotoBlurhash: true,
  allowActivityInteractions: true,
  allowActivityReplayViewing: true,
  allowActivityHeartRateViewing: true,
  allowActivityElevationViewing: true,
  allowActivityPaceViewing: true,
  allowActivitySharing: true,
} as const;

const ACTIVITY_FEED_PROFILE_SELECT = {
  ...ACTIVITY_CARD_PROFILE_SELECT,
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
  hideMap: true,
  isFavorite: true,
  media: {
    where: { moderationStatus: 'visible' },
    select: {
      id: true,
      url: true,
      thumbnail: true,
      blurhash: true,
      mediaReviewStatus: true,
      mediaModerationAssetId: true,
      thumbnailModerationAssetId: true,
    },
    orderBy: { position: 'asc' },
  },
  mapPhotoUrl: true,
  routeOnlyMapPhotoUrl: true,
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
  _count: { select: { comments: { where: { moderationStatus: 'visible' } }, likes: true } },
} as const;

const ACTIVITY_FEED_SELECT = {
  ...ACTIVITY_CARD_SELECT,
  profile: { select: ACTIVITY_FEED_PROFILE_SELECT },
} as const;

export const ACTIVITY_DETAILS_SELECT = {
  ...ACTIVITY_FEED_SELECT,
  moderationStatus: true,
  profile: {
    select: {
      ...ACTIVITY_FEED_PROFILE_SELECT,
      age: true,
      restingHeartRate: true,
      maxHeartRate: true,
    },
  },
  description: true,
  visibility: true,
  emotion: true,
  kilometresSplit: true,
  averageHeartRate: true,
  minHeartRate: true,
  maxHeartRate: true,
} as const;
