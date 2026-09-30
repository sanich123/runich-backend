import { extname } from 'node:path';

export const UPLOAD_LIMITS = {
  photoBytes: 15 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
  mediaBatchFiles: 10,
  mediaBatchBytes: 100 * 1024 * 1024,
  migrationArchiveBytes: 150 * 1024 * 1024,
  migrationArchiveEntries: 5_000,
  migrationArchiveUncompressedBytes: 500 * 1024 * 1024,
} as const;

export function isZipUpload(fileName: string) {
  return extname(fileName).toLowerCase() === '.zip';
}
