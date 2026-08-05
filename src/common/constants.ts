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
  ids = 'ids',
}

export const PRISMA_ERR_TO_HTTP_CODES = {
  P2000: HttpStatus.BAD_REQUEST,
  P2002: HttpStatus.CONFLICT,
  P2025: HttpStatus.NOT_FOUND,
};
