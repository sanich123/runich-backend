import { readFile } from 'fs/promises';
import { parseGPXWithCustomParser } from '@we-gold/gpxjs';
import { DOMParser } from 'xmldom-qsa';

const customParseMethod = (txt: string): Document | null => {
  return new DOMParser().parseFromString(txt, 'text/xml');
};

export async function readFileParseGpx(filePath: string) {
  try {
    const gpxInText = await readFile(`dist/migration/archiveToSend/${filePath}`, { encoding: 'utf-8' });
    const [parsedFile, error] = parseGPXWithCustomParser(gpxInText, customParseMethod);
    return error ? [] : parsedFile.tracks[0].points;
  } catch (error) {
    console.log(error);
  }
}
