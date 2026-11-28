import { PATHS } from 'src/common/constants';
import { HttpStatus } from '@nestjs/common';

export const { like, id, activityId } = PATHS;
export const { OK, BAD_REQUEST } = HttpStatus;
export const DEFAULT_LIKE_PAGE_SIZE = 30;
export const MAX_LIKE_PAGE_SIZE = 50;
