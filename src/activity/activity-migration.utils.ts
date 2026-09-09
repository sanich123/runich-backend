import { access } from 'node:fs/promises';

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
