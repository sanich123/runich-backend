import { readFile } from 'fs/promises';
import { parseGPXWithCustomParser } from '@we-gold/gpxjs';
import { DOMParser } from 'xmldom-qsa';
import tcx from 'tcx-js';

const customParseMethod = (txt: string): Document | null => {
  return new DOMParser().parseFromString(txt, 'text/xml');
};

export async function readFileParseGpx(filePath: string) {
  let parsedPoints;
  try {
    if (filePath.includes('.gpx')) {
      const gpxInText = await readFile(`dist/migration/${filePath}`, { encoding: 'utf-8' });
      const [parsedFile] = parseGPXWithCustomParser(gpxInText, customParseMethod);
      parsedPoints = parsedFile.tracks[0].points;
    } else {
      const parsedData = new tcx.Parser(`dist/migration/${filePath}`);
      parsedPoints = parsedData.activity.trackpoints;
    }
    if (parsedPoints.length > 1000) {
      parsedPoints = parsedPoints
        .filter((_, i) => i % Math.ceil(parsedPoints.length / 1000) === 0)
        .map((point) => ({ coords: { ...point } }));
    }
    return parsedPoints || [];
  } catch (error) {
    console.log(error);
  }
}
