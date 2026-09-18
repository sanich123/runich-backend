import { extname } from 'node:path';

export const UPLOAD_LIMITS = {
  photoBytes: 15 * 1024 * 1024,
  mediaBatchFiles: 10,
  migrationArchiveBytes: 150 * 1024 * 1024,
  migrationArchiveEntries: 5_000,
  migrationArchiveUncompressedBytes: 500 * 1024 * 1024,
} as const;

export function isZipUpload(fileName: string) {
  return extname(fileName).toLowerCase() === '.zip';
}
