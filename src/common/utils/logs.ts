import { Logger } from '@nestjs/common';
import { appendFile } from 'node:fs/promises';

const logger = new Logger('FileLogger');

export async function writeLogs(log: string) {
  try {
    await appendFile('logs.log', `${log}\n`);
  } catch (error) {
    logger.error('Failed to write application log to file', error instanceof Error ? error.stack : String(error));
  }
}
