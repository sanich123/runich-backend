import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export function getMigrationArchiveDirectory() {
  return resolve(process.env.MIGRATION_ARCHIVE_DIRECTORY ?? join(process.cwd(), 'dist', 'receivedArchive'));
}

export function getMigrationWorkDirectory(jobId: string) {
  const root = resolve(process.env.MIGRATION_WORK_DIRECTORY ?? join(tmpdir(), 'runich-activity-migrations'));
  return join(root, jobId);
}
