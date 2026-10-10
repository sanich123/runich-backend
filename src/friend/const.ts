import { PATHS } from 'src/common/constants';
import { HttpStatus } from '@nestjs/common';

export const { friend, id } = PATHS;
export const { OK, BAD_REQUEST, NO_CONTENT } = HttpStatus;

export const FRIEND_PROFILE_SELECT = {
  surname: true,
  name: true,
  profilePhoto: true,
  profilePhotoBlurhash: true,
  allowNewFollowers: true,
} as const;
