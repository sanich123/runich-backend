import { SportsLib } from '@ardentcode/sports-lib';
import { readFile } from 'fs/promises';
import { LocationObject } from 'src/activity/dto/activity.dto';
import { Logger } from '@nestjs/common';
import { parseHeartRateFromEvent, type ParsedHeartRate, type SportsActivityEvent } from './get-heart-rate-from-file';

const logger = new Logger('FitParser');

export type ParsedFitActivity = {
  locations: LocationObject[];
  heartRateData: ParsedHeartRate;
};

type FitActivity = ReturnType<SportsActivityEvent['getActivities']>[number];

function getActivityLocations(activity: FitActivity) {
  const streams = new Map(activity.getAllStreams().map((stream) => [stream.type, stream.getData()]));
  const altitude = streams.get('Altitude');
  const startTimestamp = activity.startDate.getTime();
  return activity.getPositionData().flatMap((position, index) => {
    if (
      position?.longitudeDegrees == null ||
      position?.latitudeDegrees == null ||
      !Number.isFinite(position.longitudeDegrees) ||
      !Number.isFinite(position.latitudeDegrees)
    ) {
      return [];
    }

    const altitudeValue = altitude?.[index];
    return [
      {
        coords: {
          longitude: position.longitudeDegrees,
          latitude: position.latitudeDegrees,
          ...(typeof altitudeValue === 'number' && Number.isFinite(altitudeValue) ? { altitude: altitudeValue } : {}),
          ...(Number.isFinite(startTimestamp) ? { timestamp: startTimestamp + index * 1_000 } : {}),
        },
      },
    ];
  });
}

async function importFitFile(filePath: string) {
  const buffer = await readFile(filePath);
  const fileBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return SportsLib.importFromFit(fileBuffer as ArrayBuffer);
}

export async function getCoordinatesFromFitFile(filePath: string): Promise<LocationObject[]> {
  try {
    const [activity] = (await importFitFile(filePath)).getActivities();
    return getActivityLocations(activity);
  } catch (error) {
    logger.error(`Не удалось обработать FIT-файл ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}

export async function parseFitActivityFromFile(filePath: string): Promise<ParsedFitActivity> {
  try {
    const event = await importFitFile(filePath);
    const [activity] = event.getActivities();
    return { locations: getActivityLocations(activity), heartRateData: parseHeartRateFromEvent(event) };
  } catch (error) {
    logger.error(`Не удалось обработать FIT-файл ${filePath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
