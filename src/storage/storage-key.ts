import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function getUserUploadKey(userId: string, extension: string) {
  return `${userId}/uploads/${randomUUID()}.${extension}`;
}

export function getProfilePhotoKey(userId: string, extension: string, createdAt = new Date()) {
  return `${userId}/profile/${getDateFolder(createdAt)}/${randomUUID()}.${extension}`;
}

export function getActivityPhotoKey(userId: string, activityId: string, extension: string, createdAt = new Date()) {
  return `${userId}/activities/${activityId}/${getDateFolder(createdAt)}/${randomUUID()}.${extension}`;
}

export function getActivityMapKey(userId: string, activityId: string) {
  return `${userId}/activities/${activityId}/map.webp`;
}

export function getFeedbackPhotoKey(userId: string, feedbackId: string, extension: string, createdAt = new Date()) {
  return `${userId}/feedback/${getDateFolder(createdAt)}/${feedbackId}/${randomUUID()}.${extension}`;
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

function getDateFolder(date: Date) {
  if (Number.isNaN(date.getTime())) throw new Error('Некорректная дата создания media-файла');
  return date.toISOString().slice(0, 10);
}
