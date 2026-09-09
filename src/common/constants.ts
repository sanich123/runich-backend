import { HttpStatus } from '@nestjs/common';

export const PATHS = {
  profile: 'profile',
  activity: 'activity',
  comment: 'comment',
  commentLike: 'commentLike',
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

// The mobile client reduces tracked routes to this size before sending them.
export const MAX_ACTIVITY_LOCATIONS = 5_000;
export const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024;
