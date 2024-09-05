import { SportsLib } from '@ardentcode/sports-lib';
import { readFile } from 'fs/promises';

export async function getCoordinatesFromFitFile(filePath: string) {
  try {
    const fileBuffer = (await readFile(filePath)).buffer;
    const getSportsLibEventFromBuffer = await SportsLib.importFromFit(fileBuffer);
    const [activities] = getSportsLibEventFromBuffer.getActivities();
    return activities
      .getPositionData()
      .filter(Boolean)
      .map((position) => ({ coords: { longitude: position.longitudeDegrees, latitude: position.latitudeDegrees } }));
  } catch (error) {
    console.log('error from parsing fit file', error);
  }
}
