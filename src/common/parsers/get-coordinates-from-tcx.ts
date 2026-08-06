import * as Tcx from 'tcx-js';
import { LocationObject } from 'src/activity/activity.dto';
import { Logger } from '@nestjs/common';

const logger = new Logger('TcxParser');

export async function getCoordinatesFromTcxFile(filePath: string): Promise<LocationObject[]> {
  try {
    const parsedData = await new Tcx.Parser(filePath);
    const coordinates = parsedData.activity.trackpoints
      .filter(({ latitude, longitude }) => latitude != null && longitude != null)
      .map(({ latitude, longitude }) => ({ coords: { latitude: Number(latitude), longitude: Number(longitude) } }));
    return coordinates;
  } catch (error) {
    logger.error(`Failed to parse TCX file ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
