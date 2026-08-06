import { SportsLib } from '@ardentcode/sports-lib';
import { readFile } from 'fs/promises';
import { LocationObject } from 'src/activity/activity.dto';
import { Logger } from '@nestjs/common';

const logger = new Logger('FitParser');

export async function getCoordinatesFromFitFile(filePath: string): Promise<LocationObject[]> {
  try {
    const fileBuffer = (await readFile(filePath)).buffer;
    const getSportsLibEventFromBuffer = await SportsLib.importFromFit(fileBuffer as ArrayBuffer);
    const [activities] = getSportsLibEventFromBuffer.getActivities();
    return activities
      .getPositionData()
      .filter((position): position is { longitudeDegrees: number; latitudeDegrees: number } =>
        Boolean(position?.longitudeDegrees != null && position?.latitudeDegrees != null),
      )
      .map((position) => ({ coords: { longitude: position.longitudeDegrees, latitude: position.latitudeDegrees } }));
  } catch (error) {
    logger.error(`Failed to parse FIT file ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
