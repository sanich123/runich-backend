import * as AdmZip from 'adm-zip';
import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';

export async function unzipTransferArchive(source: string) {
  const destination = join(process.cwd(), 'dist', 'migration');
  if (existsSync(destination)) {
    await rm(destination, { recursive: true, force: true });
  }
  await mkdir(destination, { recursive: true });
  const zip = new AdmZip(source);
  zip.extractAllTo(destination, true);
}
