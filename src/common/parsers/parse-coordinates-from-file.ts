import { getCoordinatesFromFitFile } from './get-coordinates-from-fit';
import { getCoordinatesFromTcxFile } from './get-coordinates-from-tcx';
import { getCoordinatesFromGpxFile } from './get-coordinates-from-gpx';
import { existsSync } from 'node:fs';
import { join } from 'path';
import { LocationObject } from 'src/activity/activity.dto';
import { Logger } from '@nestjs/common';

const logger = new Logger('CoordinatesParser');

export async function parseCoordinatesFromFile(
  filePath: string,
  migrationDirectory = join(process.cwd(), 'dist', 'migration'),
): Promise<LocationObject[]> {
  const inputFilePath = join(migrationDirectory, filePath);
  try {
    if (!existsSync(inputFilePath)) {
      throw new Error(`Файл с координатами не найден: ${filePath}`);
    }
    if (filePath.includes('.gpx')) {
      return await getCoordinatesFromGpxFile(inputFilePath);
    }
    if (filePath.includes('.tcx')) {
      return await getCoordinatesFromTcxFile(inputFilePath);
    }
    if (filePath.includes('.fit')) {
      return await getCoordinatesFromFitFile(inputFilePath);
    }
    return [];
  } catch (error) {
    logger.error(
      `Не удалось обработать файл с координатами ${filePath}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw error;
  }
}
