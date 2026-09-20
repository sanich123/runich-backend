import type { ActivityMediaObject } from './activity.dto';

export function getMediaProcessingErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isPhotoVideoObject(value: unknown): value is ActivityMediaObject & { position?: number } {
  return Boolean(value && typeof value === 'object' && 'url' in value && typeof value.url === 'string');
}

export function hasBlurhash(photo: ActivityMediaObject) {
  return typeof photo.blurhash === 'string' && photo.blurhash.length > 0;
}
