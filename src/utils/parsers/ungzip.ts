import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { createGunzip } from 'node:zlib';

export async function ungzipFile(sourcePath: string, destinationPath: string) {
  try {
    const pipe = promisify(pipeline);
    const gzip = createGunzip();
    const source = createReadStream(sourcePath);
    const destination = createWriteStream(destinationPath);
    await pipe(source, gzip, destination);
  } catch (error) {
    console.log('an error', error);
  }
}
