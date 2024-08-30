import * as AdmZip from 'adm-zip';

export async function unzipTransferArchive(source: string) {
  const zip = new AdmZip(source);
  await zip.extractAllTo('dist/migration');
}


