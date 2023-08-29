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
  SUCCESS_DELETE: 'We have just successfully deleted your data from the storage',
  NOT_FOUND_TRACK: 'We could not be able to find track with received id',
  NOT_FOUND_ARTIST: 'We could not be able to find artist with received id',
  NOT_FOUND_ALBUM: 'We could not be able to find album with received id',
  ADD_TRACK_TO_FAVORITES: 'Successfully add track to favorites',
  ADD_ALBUM_TO_FAVORITES: 'Successfully add album to favorites',
  ADD_ARTIST_TO_FAVORITES: 'Successfully add artist to favorites',
  NOT_FOUND_FAVORITE_TRACK: 'We could not be able to find received track id in favorites',
  NOT_FOUND_FAVORITE_ALBUM: 'We could not be able to find received album id in favorites',
  NOT_FOUND_FAVORITES_ARTIST: 'We could not be able to find received artist id in favorites',
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
