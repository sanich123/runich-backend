import * as Tcx from 'tcx-js';
import { LocationObject } from 'src/activity/activity.dto';
import { Logger } from '@nestjs/common';

const logger = new Logger('TcxParser');

export async function getCoordinatesFromTcxFile(filePath: string): Promise<LocationObject[]> {
  try {
    const parsedData = await new Tcx.Parser(filePath);
    const coordinates = parsedData.activity.trackpoints
      .filter(({ latitude, longitude }) => latitude != null && longitude != null)
      .map(({ latitude, longitude, altitude_meters, epoch_ms }) => {
        const altitude = altitude_meters == null ? null : Number(altitude_meters);
        const timestamp = epoch_ms == null ? null : Number(epoch_ms);

        return {
          coords: {
            latitude: Number(latitude),
            longitude: Number(longitude),
            ...(altitude !== null && Number.isFinite(altitude) ? { altitude } : {}),
            ...(timestamp !== null && Number.isFinite(timestamp) ? { timestamp } : {}),
          },
        };
      });
    return coordinates;
  } catch (error) {
    logger.error(`Не удалось обработать TCX-файл ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
