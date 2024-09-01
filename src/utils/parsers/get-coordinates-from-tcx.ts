import * as Tcx from 'tcx-js';

export async function getCoordinatesFromTcxFile(filePath: string) {
  try {
    const parsedData = await new Tcx.Parser(filePath);
    const coordinates = parsedData.activity.trackpoints.map(({ latitude, longitude }) => ({
      coords: { latitude, longitude },
    }));
    return coordinates;
  } catch (error) {
    console.log('error during parse tcx file', error);
  }
}
