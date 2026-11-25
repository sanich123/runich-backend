import { getCoordinatesFromFitFile, parseFitActivityFromFile } from './get-coordinates-from-fit';
import { getCoordinatesFromTcxFile, parseTcxActivityFromFile } from './get-coordinates-from-tcx';
import { getCoordinatesFromGpxFile, parseGpxActivityFromFile } from './get-coordinates-from-gpx';
import { existsSync } from 'node:fs';
import { extname, join } from 'path';
import { LocationObject } from 'src/activity/dto/activity.dto';
import { Logger } from '@nestjs/common';
import { resolveMigrationPath } from './migration-path';

const logger = new Logger('CoordinatesParser');

export async function parseCoordinatesFromFile(
  filePath: string,
  migrationDirectory = join(process.cwd(), 'dist', 'migration'),
): Promise<LocationObject[]> {
  try {
    const inputFilePath = resolveMigrationPath(migrationDirectory, filePath);
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

export async function parseFitActivityFromMigrationFile(
  filePath: string,
  migrationDirectory = join(process.cwd(), 'dist', 'migration'),
) {
  try {
    const inputFilePath = resolveMigrationPath(migrationDirectory, filePath);
    if (!existsSync(inputFilePath)) {
      throw new Error(`Файл с координатами не найден: ${filePath}`);
    }
    return await parseFitActivityFromFile(inputFilePath);
  } catch (error) {
    logger.error(`Не удалось обработать FIT-файл ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}

export async function parseActivityDataFromMigrationFile(
  filePath: string,
  migrationDirectory = join(process.cwd(), 'dist', 'migration'),
) {
  try {
    const inputFilePath = resolveMigrationPath(migrationDirectory, filePath);
    if (!existsSync(inputFilePath)) {
      throw new Error(`Файл с координатами не найден: ${filePath}`);
    }

    const extension = extname(filePath).toLowerCase();
    if (extension === '.gpx') return await parseGpxActivityFromFile(inputFilePath);
    if (extension === '.tcx') return await parseTcxActivityFromFile(inputFilePath);
    if (extension === '.fit') return await parseFitActivityFromFile(inputFilePath);
    return { locations: [], heartRateData: { samples: [] } };
  } catch (error) {
    logger.error(
      `Не удалось обработать файл миграции ${filePath}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw error;
  }
}
