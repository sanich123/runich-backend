import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { createGunzip } from 'node:zlib';
import { join } from 'path';
import { Logger } from '@nestjs/common';

const logger = new Logger('GzipParser');

export async function ungzipFile(sourcePath: string, migrationDirectory = join(process.cwd(), 'dist', 'migration')) {
  try {
    const pipe = promisify(pipeline);
    const gzip = createGunzip();
    const source = createReadStream(join(migrationDirectory, sourcePath));
    const destination = createWriteStream(join(migrationDirectory, sourcePath.slice(0, -3)));
    await pipe(source, gzip, destination);
  } catch (error) {
    logger.error(
      `Не удалось распаковать GZIP-файл ${sourcePath}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw error;
  }
}
