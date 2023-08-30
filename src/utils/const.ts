import { HttpStatus } from '@nestjs/common';

export const PATHS = {
  USER: 'user',
  TRACK: 'track',
  ALBUM: 'album',
  ARTIST: 'artist',
  FAVORITES: 'favs',
};

export const MESSAGES = {
  NOT_FOUND_USER: 'We could not be able to find user with received id',
  WRONG_PASSWORD: 'Received old password does not equal user password, stored in the database',
  NOT_FOUND_TRACK: 'We could not be able to find track with received id',
  NOT_FOUND_ARTIST: 'We could not be able to find artist with received id',
  NOT_FOUND_ALBUM: 'We could not be able to find album with received id',
  NOT_FOUND_FAVORITE: 'We could not be able to find favorite entity with received id',
  NON_EXISTING_LOGIN: 'This login does not exist in database',
  DIDNT_MATCH_PASSWORDS: 'Password in the database does not equals received passwrod',
  ALREADY_EXIST_LOGIN: 'This login is already in a database',
  WRONG_TOKEN: 'Token is invalid or expired',
  SIGN_TOKENS_ERROR: 'Something wrong with signing tokens',
  HASHING_PASSWORD_ERROR: 'Something wrong with hashing password',
  COMPARING_PASSWORD_ERROR: 'Something wrong with password comparing or tokens',
};

export const PLACES = {
  TRACKS: 'tracks',
  ALBUMS: 'albums',
  USERS: 'users',
  ARTISTS: 'artists',
  FAVS: 'favorites',
};

export const PROPS_TO_DELETE = {
  artistId: 'artistId',
  albumId: 'albumId',
};

export const MAP_ERRORS = {
  P2000: HttpStatus.BAD_REQUEST,
  P2002: HttpStatus.CONFLICT,
  P2025: HttpStatus.NOT_FOUND,
};
export const PRISMA_ERR_TO_HTTP_CODES = {
  P2000: HttpStatus.BAD_REQUEST,
  P2002: HttpStatus.CONFLICT,
  P2025: HttpStatus.NOT_FOUND,
};
