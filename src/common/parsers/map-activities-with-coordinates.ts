import { extname, join } from 'path';
import { parseCoordinatesFromFile } from './parse-coordinates-from-file';
import { ungzipFile } from './ungzip';
import { getMapBoxImage } from './get-mapbox-image';
import { getSpeedInMinsInKm } from './get-speed';
import { Extensions, RawStravaCsvColumns } from './types';
import { v4 } from 'uuid';
import { LocationObject } from 'src/activity/activity.dto';
import type { MigratedActivity } from 'src/activity/type';
import { Logger } from '@nestjs/common';
import { calculateKilometreSplits } from './calculate-kilometre-splits';
import { reduceLocations } from './reduce-locations';
import { getHeartRateFromFile, type ParsedHeartRate } from './get-heart-rate-from-file';

const logger = new Logger('ActivityMapper');
const MIGRATION_BATCH_SIZE = 8;
const MAX_MAP_IMAGE_LOCATIONS = 500;
const MIN_HEART_RATE = 1;
const MAX_HEART_RATE = 300;

function parseCaloriesValue(value?: string | number) {
  if (value == null || String(value).trim() === '') return undefined;
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? Math.round(parsedValue) : undefined;
}

function parseHeartRateValue(value?: string | number) {
  if (value == null || String(value).trim() === '') return undefined;
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue >= MIN_HEART_RATE && parsedValue <= MAX_HEART_RATE
    ? parsedValue
    : undefined;
}

export function normalizeStravaActivityDate(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) throw new Error('Не указана дата активности Strava');

  // A date-only CSV value has no instant. Noon UTC keeps its calendar date
  // visible in every real-world time zone (UTC-12 through UTC+14).
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    const date = new Date(`${trimmedValue}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmedValue) {
      throw new Error(`Некорректная дата активности Strava: ${trimmedValue}`);
    }
    return date.toISOString();
  }

  const hasExplicitTimeZone = /(?:Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)$/i.test(trimmedValue);
  const isoLocalDateTimeMatch = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(trimmedValue);
  const date = new Date(
    hasExplicitTimeZone
      ? trimmedValue
      : isoLocalDateTimeMatch
        ? `${isoLocalDateTimeMatch[1]}T${isoLocalDateTimeMatch[2]}Z`
        : `${trimmedValue} UTC`,
  );
  if (Number.isNaN(date.getTime())) throw new Error(`Некорректная дата активности Strava: ${trimmedValue}`);
  return date.toISOString();
}

export async function mapActivitiesWithCoordinates({
  parsedActivities,
  userId,
  profileId,
  migrationDirectory,
}: {
  parsedActivities?: RawStravaCsvColumns[];
  userId: string;
  profileId: string;
  migrationDirectory?: string;
}): Promise<MigratedActivity[]> {
  try {
    if (!parsedActivities) return [];

    const results: PromiseSettledResult<MigratedActivity>[] = [];
    for (let offset = 0; offset < parsedActivities.length; offset += MIGRATION_BATCH_SIZE) {
      const batch = parsedActivities.slice(offset, offset + MIGRATION_BATCH_SIZE);
      results.push(
        ...(await Promise.allSettled(
          batch.map(async (activity, batchIndex): Promise<MigratedActivity> => {
            const i = offset + batchIndex;
            const sourceActivityId = String(activity['Activity ID'] ?? '').trim();
            if (!sourceActivityId) {
              throw new Error('Не указан идентификатор активности Strava: Activity ID');
            }

            let rawLocations: LocationObject[] = [];
            let fileName = String(activity['Filename'] ?? '').trim();

            if (extname(fileName).toLowerCase() === Extensions.gz) {
              await ungzipFile(fileName, migrationDirectory);
              fileName = fileName.slice(0, -3);
            }

            if (
              extname(fileName).toLowerCase() === Extensions.gpx ||
              extname(fileName).toLowerCase() === Extensions.tcx ||
              extname(fileName).toLowerCase() === Extensions.fit
            ) {
              rawLocations = await parseCoordinatesFromFile(fileName, migrationDirectory);
            }
            const fileExtension = extname(fileName).toLowerCase();
            const heartRateData: ParsedHeartRate =
              fileExtension === Extensions.gpx || fileExtension === Extensions.tcx || fileExtension === Extensions.fit
                ? await getHeartRateFromFile(fileName, migrationDirectory ?? join(process.cwd(), 'dist', 'migration'))
                : { samples: [] };
            logger.debug(`Processing activity ${i + 1}`);

            const movingTime = Number(activity['Moving Time']);
            const elapsedTime = Number(activity['Elapsed Time']);
            const durationSeconds = Number.isFinite(movingTime) && movingTime >= 0 ? movingTime : elapsedTime;
            const duration = Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds * 1000 : 0;
            const distance = Number(activity.Distance);
            const title = activity['Activity Name'];
            const sport = String(activity['Activity Type'] ?? '').toLowerCase();
            const description = activity['Activity Description'];
            const date = normalizeStravaActivityDate(String(activity['Activity Date'] ?? ''));
            const speed = getSpeedInMinsInKm(distance, duration).paceAsNumber;
            const kilometresSplit = calculateKilometreSplits(rawLocations, duration, distance);
            const locations = reduceLocations(rawLocations);
            const parsedSourceElevationGain = Number(activity['Elevation Gain']);
            const sourceElevationGain =
              String(activity['Elevation Gain'] ?? '').trim() !== '' &&
              Number.isFinite(parsedSourceElevationGain) &&
              parsedSourceElevationGain >= 0
                ? parsedSourceElevationGain
                : undefined;
            const csvCaloriesActive = parseCaloriesValue(activity.Calories);
            const csvAverageHeartRate = parseHeartRateValue(activity['Average Heart Rate']);
            const csvMaxHeartRate = parseHeartRateValue(activity['Max Heart Rate']);
            const mapPhotoUrl =
              rawLocations.length > 1 && process.env.MAPBOX_ACCESS_TOKEN
                ? getMapBoxImage(reduceLocations(rawLocations, MAX_MAP_IMAGE_LOCATIONS))
                : '';

            return {
              id: v4(),
              source: 'strava',
              sourceActivityId,
              date,
              title,
              sport,
              description,
              duration,
              distance,
              speed,
              locations,
              kilometresSplit,
              ...(sourceElevationGain !== undefined ? { sourceElevationGain } : {}),
              ...(csvCaloriesActive !== undefined ? { caloriesActive: csvCaloriesActive } : {}),
              ...(heartRateData.samples.length ? { heartRateSamples: heartRateData.samples } : {}),
              ...(csvAverageHeartRate !== undefined || heartRateData.statistics
                ? { averageHeartRate: csvAverageHeartRate ?? heartRateData.statistics?.averageHeartRate }
                : {}),
              ...(heartRateData.statistics ? { minHeartRate: heartRateData.statistics.minHeartRate } : {}),
              ...(csvMaxHeartRate !== undefined || heartRateData.statistics
                ? { maxHeartRate: csvMaxHeartRate ?? heartRateData.statistics?.maxHeartRate }
                : {}),
              userId,
              mapPhotoUrl,
              profileId,
            };
          }),
        )),
      );
    }

    const failedResults = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    failedResults.forEach((result) => {
      logger.warn(`Активность пропущена: не удалось обработать координаты. Причина: ${String(result.reason)}`);
    });

    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<MigratedActivity> => result.status === 'fulfilled')
      .map((result) => result.value);

    return successfulResults;
  } catch (error) {
    logger.error('Не удалось обработать активности и координаты', error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
