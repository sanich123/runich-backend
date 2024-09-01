import { getCoordinatesFromFitFile } from './get-coordinates-from-fit';
import { getCoordinatesFromTcxFile } from './get-coordinates-from-tcx';
import { getCoordinatesFromGpxFile } from './get-coordinates-from-gpx';
import { existsSync } from 'node:fs';

export async function parseCoordinatesFromFile(filePath: string) {
  let parsedCoordinates;
  const inputFilePath = `dist/migration/${filePath}`;
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
    console.log('An error occured during parse file', error);
  }
}
