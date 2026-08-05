import { SportsLib } from '@ardentcode/sports-lib';
import { readFile } from 'fs/promises';
import { LocationObject } from 'src/activity/activity.dto';

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
    console.log('error from parsing fit file', error);
    return [];
  }
}
