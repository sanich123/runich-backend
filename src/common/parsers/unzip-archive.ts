import AdmZip from 'adm-zip';
import { existsSync } from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import { join, resolve, sep } from 'node:path';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';

type ArchiveStats = {
  entries: number;
  uncompressedBytes: number;
};

function validateArchiveEntries(zip: AdmZip): ArchiveStats {
  const entries = zip.getEntries();
  if (entries.length > UPLOAD_LIMITS.migrationArchiveEntries) {
    throw new Error('Архив содержит слишком много файлов');
  }

  let uncompressedSize = 0;
  const destination = resolve(process.cwd(), 'dist', 'migration');
  for (const entry of entries) {
    const normalizedName = entry.entryName.replaceAll('\\', '/');
    const target = resolve(destination, normalizedName);
    const isInsideDestination = target === destination || target.startsWith(`${destination}${sep}`);
    if (
      !normalizedName ||
      normalizedName.includes('\0') ||
      normalizedName.startsWith('/') ||
      /^[A-Za-z]:\//.test(normalizedName) ||
      !isInsideDestination
    ) {
      throw new Error(`Недопустимый путь в ZIP-архиве: ${entry.entryName}`);
    }

    const entrySize = Number(entry.header.size);
    if (!Number.isSafeInteger(entrySize) || entrySize < 0) {
      throw new Error(`Недопустимый размер файла в ZIP-архиве: ${entry.entryName}`);
    }
    uncompressedSize += entrySize;
    if (uncompressedSize > UPLOAD_LIMITS.migrationArchiveUncompressedBytes) {
      throw new Error('Распакованный архив превышает допустимый размер');
    }
  }

  return { entries: entries.length, uncompressedBytes: uncompressedSize };
}

export async function unzipTransferArchive(source: string) {
  const destination = join(process.cwd(), 'dist', 'migration');
  const zip = new AdmZip(source);
  const archiveStats = validateArchiveEntries(zip);
  const { size: compressedBytes } = await stat(source);
  if (existsSync(destination)) {
    await rm(destination, { recursive: true, force: true });
  }
  await mkdir(destination, { recursive: true });
  zip.extractAllTo(destination, true);

  return { ...archiveStats, compressedBytes };
}
