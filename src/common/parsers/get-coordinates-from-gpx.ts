import { parseGPXWithCustomParser } from '@we-gold/gpxjs';
import { readFile } from 'fs/promises';
import { DOMParser } from 'xmldom-qsa';
import { LocationObject } from 'src/activity/activity.dto';
import { Logger } from '@nestjs/common';

const logger = new Logger('GpxParser');

const customParseMethod = (txt: string): Document | null => {
  return new DOMParser().parseFromString(txt, 'text/xml');
};

export async function getCoordinatesFromGpxFile(filePath: string): Promise<LocationObject[]> {
  try {
    const gpxInText = await readFile(filePath, { encoding: 'utf-8' });
    const [parsedFile] = await parseGPXWithCustomParser(gpxInText, customParseMethod);
    const points = parsedFile?.tracks?.flatMap(({ points: trackPoints }) => trackPoints ?? []) ?? [];
    const coordinates = points
      .filter(({ longitude, latitude }) => Number.isFinite(longitude) && Number.isFinite(latitude))
      .map(({ longitude, latitude, elevation, time }) => {
        const parsedTimestamp =
          time instanceof Date
            ? time.getTime()
            : time && Number.isFinite(Date.parse(String(time)))
              ? Date.parse(String(time))
              : null;
        const timestamp =
          typeof parsedTimestamp === 'number' && Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;

        return {
          coords: {
            longitude,
            latitude,
            ...(typeof elevation === 'number' && Number.isFinite(elevation) ? { altitude: elevation } : {}),
            ...(timestamp !== null ? { timestamp } : {}),
          },
        };
      });
    return coordinates || [];
  } catch (error) {
    logger.error(`Не удалось обработать GPX-файл ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
