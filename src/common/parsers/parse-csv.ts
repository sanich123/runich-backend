import { parse } from 'csv-parse';
import { createReadStream } from 'node:fs';
import { existsSync } from 'fs';
import { join } from 'path';
import { RawStravaCsvColumns } from './types';
import { Logger } from '@nestjs/common';

const logger = new Logger('CsvParser');

export async function parseCsvFileIntoArray(
  migrationDirectory = join(process.cwd(), 'dist', 'migration'),
): Promise<RawStravaCsvColumns[]> {
  const records: RawStravaCsvColumns[] = [];
  const csvFileToParse = join(migrationDirectory, 'activities.csv');

  try {
    if (!existsSync(csvFileToParse)) {
      throw new Error('Файл CSV не найден: activities.csv');
    }
    const parser = createReadStream(csvFileToParse).pipe(parse({ columns: true }));
    for await (const record of parser) {
      records.push(record as RawStravaCsvColumns);
    }
    return records;
  } catch (error) {
    logger.error('Не удалось обработать CSV-файл миграции', error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
