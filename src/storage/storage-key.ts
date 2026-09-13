import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function getUserUploadKey(userId: string, extension: string) {
  return `${userId}/uploads/${randomUUID()}.${extension}`;
}

export function getProfilePhotoKey(userId: string, extension: string) {
  return `${userId}/profile/${randomUUID()}.${extension}`;
}

export function getActivityPhotoKey(userId: string, activityId: string, extension: string) {
  return `${userId}/activities/${activityId}/photos/${randomUUID()}.${extension}`;
}

export function getMigrationArchiveKey(userId: string, migrationId: string) {
  return `${userId}/migrations/${migrationId}/archive.zip`;
}

export function getExtensionFromStorageKey(key: string) {
  const extension = extname(key)
    .slice(1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return extension || 'bin';
}
