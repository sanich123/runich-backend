import { getCoordinatesFromFitFile } from './get-coordinates-from-fit';
import { getCoordinatesFromTcxFile } from './get-coordinates-from-tcx';
import { getCoordinatesFromGpxFile } from './get-coordinates-from-gpx';
import { existsSync } from 'node:fs';
import { join } from 'path';
import { LocationObject } from 'src/activity/activity.dto';
import { Logger } from '@nestjs/common';

const logger = new Logger('CoordinatesParser');

export async function parseCoordinatesFromFile(filePath: string): Promise<LocationObject[]> {
  let parsedCoordinates: LocationObject[] = [];
  const inputFilePath = join(process.cwd(), 'dist', 'migration', filePath);
  try {
    if (!existsSync(inputFilePath)) {
      throw new Error('File with coordinates doesnt exist!');
    }
    if (filePath.includes('.gpx')) {
      parsedCoordinates = await getCoordinatesFromGpxFile(inputFilePath);
    } else if (filePath.includes('.tcx')) {
      parsedCoordinates = await getCoordinatesFromTcxFile(inputFilePath);
    } else if (filePath.includes('.fit')) {
      parsedCoordinates = await getCoordinatesFromFitFile(inputFilePath);
    } else {
      parsedCoordinates = [];
    }
    if (parsedCoordinates?.length > 1000) {
      parsedCoordinates = parsedCoordinates.filter((_, i) => i % Math.ceil(parsedCoordinates.length / 1000) === 0);
    }
    return parsedCoordinates || [];
  } catch (error) {
    logger.error(`Failed to parse coordinates file ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
