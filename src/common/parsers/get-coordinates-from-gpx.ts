import { parseGPXWithCustomParser } from '@we-gold/gpxjs';
import type { ParsedGPX } from '@we-gold/gpxjs';
import { SportsLib } from '@ardentcode/sports-lib';
import { readFile } from 'fs/promises';
import { DOMParser } from 'xmldom-qsa';
import { LocationObject } from 'src/activity/dto/activity.dto';
import { Logger } from '@nestjs/common';
import { parseHeartRateFromEvent, type ParsedHeartRate } from './get-heart-rate-from-file';

const logger = new Logger('GpxParser');

export type ParsedGpxActivity = {
  locations: LocationObject[];
  heartRateData: ParsedHeartRate;
};

const customParseMethod = (txt: string): Document | null => {
  return new DOMParser().parseFromString(txt, 'text/xml');
};

function mapGpxCoordinates(parsedFile: ParsedGPX): LocationObject[] {
  const points = parsedFile.tracks.flatMap(({ points: trackPoints }) => trackPoints ?? []);
  return points
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
}

export async function parseGpxActivityFromFile(filePath: string): Promise<ParsedGpxActivity> {
  try {
    const gpxInText = await readFile(filePath, { encoding: 'utf-8' });
    const [parsedFile, parseError] = await parseGPXWithCustomParser(gpxInText, customParseMethod);
    if (parseError) throw parseError;
    if (!parsedFile) throw new Error('Не удалось разобрать GPX-файл');

    let heartRateData: ParsedHeartRate = { samples: [] };
    try {
      const parsedDocument = parsedFile.xml;
      class ReuseParsedDocument {
        parseFromString() {
          return parsedDocument;
        }
      }
      const event = await SportsLib.importFromGPX(gpxInText, ReuseParsedDocument);
      heartRateData = parseHeartRateFromEvent(event);
    } catch (error) {
      logger.warn(
        `Не удалось обработать данные пульса ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { locations: mapGpxCoordinates(parsedFile), heartRateData };
  } catch (error) {
    logger.error(`Не удалось обработать GPX-файл ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}

export async function getCoordinatesFromGpxFile(filePath: string): Promise<LocationObject[]> {
  return (await parseGpxActivityFromFile(filePath)).locations;
}
