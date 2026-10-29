import { HttpStatus } from '@nestjs/common';

export const PATHS = {
  profile: 'profile',
  activity: 'activity',
  comment: 'comment',
  friend: 'friend',
  like: 'like',
  user: 'user',
  id: ':id',
  activityId: ':activityId',
  statistics: 'statistics',
  email: 'email',
};

export const enum QueryParams {
  firstDay = 'firstDay',
  lastDay = 'lastDay',
  timeZone = 'timeZone',
  year = 'year',
  month = 'month',
  take = 'take',
  page = 'page',
  cursor = 'cursor',
  ids = 'ids',
}

export const DATABASE_ERROR_TO_HTTP_STATUS = {
  P2000: HttpStatus.BAD_REQUEST,
  P2002: HttpStatus.CONFLICT,
  P2025: HttpStatus.NOT_FOUND,
};

// Initial activity submissions and legacy clients may include up to this many route points.
export const MAX_ACTIVITY_LOCATIONS = 5_000;
export const MAX_RAW_ACTIVITY_LOCATIONS = 100_000;
export const MAX_ACTIVITY_HEART_RATE_SAMPLES = 15_000;
export const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024;
export const MAX_RAW_ACTIVITY_ROUTE_BODY_BYTES = 32 * 1024 * 1024;
