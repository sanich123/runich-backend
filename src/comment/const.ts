import { PATHS } from 'src/common/constants';
import { HttpStatus } from '@nestjs/common';

export const { comment, id, like } = PATHS;
export const { OK, BAD_REQUEST, CREATED, NO_CONTENT } = HttpStatus;

export const COMMENT_PROFILE_SELECT = {
  surname: true,
  name: true,
  profilePhoto: true,
  profilePhotoBlurhash: true,
  emailNotifications: true,
  user: { select: { email: true } },
} as const;
