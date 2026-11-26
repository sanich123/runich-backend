import { readFile } from 'node:fs/promises';
import { SportsLib } from '@ardentcode/sports-lib';
import { DOMParser } from 'xmldom-qsa';
import { LocationObject } from 'src/activity/dto/activity.dto';
import { Logger } from '@nestjs/common';
import { parseHeartRateFromEvent, type ParsedHeartRate } from './get-heart-rate-from-file';

const logger = new Logger('TcxParser');

export type ParsedTcxActivity = {
  locations: LocationObject[];
  heartRateData: ParsedHeartRate;
};

function readElementText(element: Element, name: string) {
  return element.getElementsByTagName(name)[0]?.textContent ?? null;
}

export async function parseTcxActivityFromFile(filePath: string): Promise<ParsedTcxActivity> {
  try {
    const tcx = await readFile(filePath, { encoding: 'utf-8' });
    const document = new DOMParser().parseFromString(tcx, 'text/xml');
    const [activity] = Array.from(document.getElementsByTagName('Activity'));
    const trackpoints = activity ? Array.from(activity.getElementsByTagName('Trackpoint')) : [];
    const locations = trackpoints.map((trackpoint) => {
      const position = trackpoint.getElementsByTagName('Position')[0];
      const latitude = position ? Number(readElementText(position, 'LatitudeDegrees')) : 0;
      const longitude = position ? Number(readElementText(position, 'LongitudeDegrees')) : 0;
      const altitudeText = readElementText(trackpoint, 'AltitudeMeters');
      const altitude = altitudeText === null ? null : Number(altitudeText);
      const timeText = readElementText(trackpoint, 'Time');
      const timestamp = timeText === null ? 0 : Date.parse(timeText);

      return {
        coords: {
          latitude,
          longitude,
          ...(altitude !== null && Number.isFinite(altitude) ? { altitude } : {}),
          ...(Number.isFinite(timestamp) ? { timestamp } : {}),
        },
      };
    });

    let heartRateData: ParsedHeartRate = { samples: [] };
    try {
      heartRateData = parseHeartRateFromEvent(await SportsLib.importFromTCX(document));
    } catch (error) {
      logger.warn(
        `Не удалось обработать данные пульса ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { locations, heartRateData };
  } catch (error) {
    logger.error(`Не удалось обработать TCX-файл ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}

export async function getCoordinatesFromTcxFile(filePath: string): Promise<LocationObject[]> {
  return (await parseTcxActivityFromFile(filePath)).locations;
}
