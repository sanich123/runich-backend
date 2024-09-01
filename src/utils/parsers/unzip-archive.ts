import * as AdmZip from 'adm-zip';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';

export async function unzipTransferArchive(source: string) {
  const destination = 'dist/migration';
  try {
    if (existsSync(destination)) {
      await rm(destination, { recursive: true });
    }
    const zip = new AdmZip(source);
    await zip.extractAllTo(destination);
  } catch (error) {
    console.log('An error occured while trying to unzip file', error);
  }
}
