import { resolve, sep } from 'node:path';

export function resolveMigrationPath(migrationDirectory: string, relativePath: string) {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  const resolvedDirectory = resolve(migrationDirectory);
  const resolvedPath = resolve(resolvedDirectory, normalizedPath);
  const isInsideDirectory = resolvedPath.startsWith(`${resolvedDirectory}${sep}`);

  if (
    !normalizedPath ||
    normalizedPath.includes('\0') ||
    normalizedPath.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalizedPath) ||
    !isInsideDirectory
  ) {
    throw new Error(`Недопустимый путь файла миграции: ${relativePath}`);
  }

  return resolvedPath;
}
