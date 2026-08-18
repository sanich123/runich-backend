import { SportsLib } from '@ardentcode/sports-lib';
import { readFile } from 'fs/promises';
import { LocationObject } from 'src/activity/activity.dto';
import { Logger } from '@nestjs/common';

const logger = new Logger('FitParser');

export async function getCoordinatesFromFitFile(filePath: string): Promise<LocationObject[]> {
  try {
    const buffer = await readFile(filePath);
    const fileBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const getSportsLibEventFromBuffer = await SportsLib.importFromFit(fileBuffer as ArrayBuffer);
    const [activities] = getSportsLibEventFromBuffer.getActivities();
    const streams = new Map(activities.getAllStreams().map((stream) => [stream.type, stream.getData()]));
    const altitude = streams.get('Altitude');
    return activities.getPositionData().flatMap((position, index) => {
      if (
        position?.longitudeDegrees == null ||
        position?.latitudeDegrees == null ||
        !Number.isFinite(position.longitudeDegrees) ||
        !Number.isFinite(position.latitudeDegrees)
      ) {
        return [];
      }

      const altitudeValue = altitude?.[index];
      return [
        {
          coords: {
            longitude: position.longitudeDegrees,
            latitude: position.latitudeDegrees,
            ...(typeof altitudeValue === 'number' && Number.isFinite(altitudeValue) ? { altitude: altitudeValue } : {}),
          },
        },
      ];
    });
  } catch (error) {
    logger.error(`Не удалось обработать FIT-файл ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
