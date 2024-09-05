import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { createGunzip } from 'node:zlib';

export async function ungzipFile(sourcePath: string) {
  try {
    const pipe = promisify(pipeline);
    const gzip = createGunzip();
    const source = createReadStream(`dist/migration/${sourcePath}`);
    const destination = createWriteStream(`dist/migration/${sourcePath.slice(0, -3)}`);
    await pipe(source, gzip, destination);
  } catch (error) {
    console.log('An error during ungzipping file', error);
  }
}
