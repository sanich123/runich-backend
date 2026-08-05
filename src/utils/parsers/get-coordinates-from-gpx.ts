import { parseGPXWithCustomParser } from '@we-gold/gpxjs';
import { readFile } from 'fs/promises';
import { DOMParser } from 'xmldom-qsa';
import { LocationObject } from 'src/activity/activity.dto';

const customParseMethod = (txt: string): Document | null => {
  return new DOMParser().parseFromString(txt, 'text/xml');
};

export async function getCoordinatesFromGpxFile(filePath: string): Promise<LocationObject[]> {
  try {
    const gpxInText = await readFile(filePath, { encoding: 'utf-8' });
    const [parsedFile] = await parseGPXWithCustomParser(gpxInText, customParseMethod);
    const coordinates = parsedFile?.tracks[0]?.points?.map(({ longitude, latitude }) => ({
      coords: { longitude, latitude },
    }));
    return coordinates || [];
  } catch (error) {
    console.log('an error occured during parsing gpx file', error);
    return [];
  }
}
