import type { MockProfilePrivacySettings } from './mock-seed.types';

export const MOCK_EMAIL_PREFIX = 'runich.mock.runner.';
export const MOCK_SEED_VERSION = 'runich-mock-v12';
export const MOCK_USER_COUNT = 100;
export const MAX_MOCK_RELATION_COUNT = 40;
export const CREATE_MANY_BATCH_SIZE = 1_000;
export const DAY_IN_MS = 86_400_000;
export const MINUTE_IN_MS = 60_000;

export const MOCK_PROFILE_PRIVACY_PRESETS: MockProfilePrivacySettings[] = [
  {
    profileSearchVisible: false,
    allowActivityInteractions: false,
    allowLikesListViewing: true,
    hideActivityStatistics: true,
    hideFollowingList: true,
    hideProfilePhotos: true,
  },
  {
    profileSearchVisible: true,
    allowActivityInteractions: false,
    allowLikesListViewing: true,
    hideActivityStatistics: true,
    hideFollowingList: true,
    hideProfilePhotos: true,
  },
  {
    profileSearchVisible: true,
    allowActivityInteractions: true,
    allowLikesListViewing: true,
    hideActivityStatistics: true,
    hideFollowingList: false,
    hideProfilePhotos: true,
  },
  {
    profileSearchVisible: true,
    allowActivityInteractions: false,
    allowLikesListViewing: true,
    hideActivityStatistics: false,
    hideFollowingList: false,
    hideProfilePhotos: false,
  },
  {
    profileSearchVisible: true,
    allowActivityInteractions: true,
    allowLikesListViewing: true,
    hideActivityStatistics: false,
    hideFollowingList: false,
    hideProfilePhotos: false,
  },
];

export const MOCK_RUNNERS = [
  ['Eliud', 'Kipchoge', 'Kaptagat'],
  ['Kenenisa', 'Bekele', 'Addis Ababa'],
  ['Mo', 'Farah', 'London'],
  ['Haile', 'Gebrselassie', 'Addis Ababa'],
  ['Faith', 'Kipyegon', 'Eldoret'],
  ['Sifan', 'Hassan', 'Arnhem'],
  ['Jakob', 'Ingebrigtsen', 'Sandnes'],
  ['Brigid', 'Kosgei', 'Nairobi'],
  ['Tigst', 'Assefa', 'Addis Ababa'],
  ['Kelvin', 'Kiptum', 'Chepkorio'],
  ['Ruth', 'Chepngetich', 'Nairobi'],
  ['Shelly-Ann', 'Fraser-Pryce', 'Kingston'],
  ['Allyson', 'Felix', 'Los Angeles'],
  ['Yulimar', 'Rojas', 'Caracas'],
  ['Sydney', 'McLaughlin-Levrone', 'Los Angeles'],
  ['Genzebe', 'Dibaba', 'Addis Ababa'],
  ['Letesenbet', 'Gidey', 'Tigray'],
  ['Joshua', 'Cheptegei', 'Kampala'],
  ['Yomif', 'Kejelcha', 'Addis Ababa'],
  ['Paula', 'Radcliffe', 'London'],
] as const;

export const MOCK_ACTIVITY_PHOTO =
  'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=80';

export const MOCK_COMMENT_TEXTS = [
  'Сильная тренировка!',
  'Отличный темп и красивый маршрут.',
  'Так держать!',
  'Вдохновляет на свою пробежку.',
  'Классный результат.',
];

export const MOCK_ACTIVITY_TITLES = ['Morning run', 'Tempo run', 'Long run', 'Recovery run'];
export const MOCK_SPORTS = ['run', 'walk', 'ride'];
export const MOCK_EMOTIONS = ['ENERGETIC', 'HAPPY', 'CALM'];

const stableRunnerPhotoIds = [3764014, 3763879, 2402777, 3621185, 2774556, 3768114, 2526878, 1128317];

export const MOCK_RUNNER_PHOTOS = stableRunnerPhotoIds.map(
  (photoId) =>
    `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=256`,
);
