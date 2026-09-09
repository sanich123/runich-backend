import { Logger } from '@nestjs/common';
import { appendFile } from 'node:fs/promises';

const logger = new Logger('FileLogger');

export async function writeLogs(log: string) {
  try {
    await appendFile(process.env.LOG_FILE_PATH ?? 'logs.log', `${log}\n`);
  } catch (error) {
    logger.error('Не удалось записать лог приложения в файл', error instanceof Error ? error.stack : String(error));
  }
}
