import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ACTIVITY_MIGRATION_CONFIG } from './activity-migration-config';

export function getMigrationArchiveDirectory() {
  return resolve(process.cwd(), ACTIVITY_MIGRATION_CONFIG.archiveDirectory);
}

export function getMigrationIncomingArchivePath(jobId: string) {
  return join(getMigrationArchiveDirectory(), `${jobId}.zip`);
}

export function getMigrationWorkDirectory(jobId: string) {
  const root = resolve(process.env.MIGRATION_WORK_DIRECTORY ?? join(tmpdir(), 'runich-activity-migrations'));
  return join(root, jobId);
}
