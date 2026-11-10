import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ACTIVITY_MIGRATION_CONFIG } from './const';

export function getMigrationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 4_000);
  return String(error).slice(0, 4_000);
}

export async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

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
