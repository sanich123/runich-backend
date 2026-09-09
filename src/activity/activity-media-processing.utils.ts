import type { ActivityPhotoVideoObject } from './activity.dto';

export function getMediaProcessingErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isPhotoVideoObject(value: unknown): value is ActivityPhotoVideoObject {
  return Boolean(value && typeof value === 'object' && 'url' in value && typeof value.url === 'string');
}

export function hasBlurhash(photo: ActivityPhotoVideoObject) {
  return typeof photo.blurhash === 'string' && photo.blurhash.length > 0;
}
