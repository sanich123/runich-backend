import { join, resolve } from 'node:path';

export function getMigrationArchiveDirectory() {
  return resolve(process.env.MIGRATION_ARCHIVE_DIRECTORY ?? join(process.cwd(), 'dist', 'receivedArchive'));
}

export function getMigrationWorkDirectory(jobId: string) {
  return join(process.cwd(), 'dist', 'migration', jobId);
}
