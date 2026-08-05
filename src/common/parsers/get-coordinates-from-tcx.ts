import * as Tcx from 'tcx-js';
import { LocationObject } from 'src/activity/activity.dto';

export async function getCoordinatesFromTcxFile(filePath: string): Promise<LocationObject[]> {
  try {
    const parsedData = await new Tcx.Parser(filePath);
    const coordinates = parsedData.activity.trackpoints
      .filter(({ latitude, longitude }) => latitude != null && longitude != null)
      .map(({ latitude, longitude }) => ({ coords: { latitude: Number(latitude), longitude: Number(longitude) } }));
    return coordinates;
  } catch (error) {
    console.log('error during parse tcx file', error);
    return [];
  }
}
