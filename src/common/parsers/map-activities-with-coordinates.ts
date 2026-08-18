import { extname } from 'path';
import { parseCoordinatesFromFile } from './parse-coordinates-from-file';
import { ungzipFile } from './ungzip';
import { getMapBoxImage } from './get-mapbox-image';
import { getSpeedInMinsInKm } from './get-speed';
import { Extensions, RawStravaCsvColumns } from './types';
import { v4 } from 'uuid';
import { ActivityDto, LocationObject } from 'src/activity/activity.dto';
import { Logger } from '@nestjs/common';
import { calculateKilometreSplits } from './calculate-kilometre-splits';
import { reduceLocations } from './reduce-locations';

const logger = new Logger('ActivityMapper');
const MIGRATION_BATCH_SIZE = 8;
const MAX_MAP_IMAGE_LOCATIONS = 500;

type MigratedActivity = ActivityDto & {
  id: string;
  user_id: string;
  profileId: string;
  source: 'strava';
  sourceActivityId: string;
};
export async function mapActivitiesWithCoordinates({
  parsedActivities,
  userId,
  profileId,
}: {
  parsedActivities?: RawStravaCsvColumns[];
  userId: string;
  profileId: string;
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
            let fileName = activity['Filename'];

            if (extname(fileName) === Extensions.gz) {
              await ungzipFile(fileName);
              fileName = fileName.slice(0, -3);
            }

            if (
              extname(fileName) === Extensions.gpx ||
              extname(fileName) === Extensions.tcx ||
              extname(fileName) === Extensions.fit
            ) {
              rawLocations = await parseCoordinatesFromFile(fileName);
            }
            logger.debug(`Processing activity ${i + 1}`);

            const movingTime = Number(activity['Moving Time']);
            const elapsedTime = Number(activity['Elapsed Time']);
            const durationSeconds = Number.isFinite(movingTime) && movingTime >= 0 ? movingTime : elapsedTime;
            const duration = Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds * 1000 : 0;
            const distance = Number(activity.Distance);
            const title = activity['Activity Name'];
            const sport = activity['Activity Type'].toLowerCase();
            const description = activity['Activity Description'];
            const date = new Date(activity['Activity Date']).toISOString();
            const speed = getSpeedInMinsInKm(distance, duration).paceAsNumber;
            const kilometresSplit = calculateKilometreSplits(rawLocations, duration);
            const locations = reduceLocations(rawLocations);
            const mapPhotoUrl =
              rawLocations.length > 1 ? getMapBoxImage(reduceLocations(rawLocations, MAX_MAP_IMAGE_LOCATIONS)) : '';

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
              user_id: userId,
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

    if (parsedActivities.length > 0 && successfulResults.length === 0 && failedResults.length > 0) {
      throw new Error('Не удалось обработать ни одной активности из архива миграции');
    }

    return successfulResults;
  } catch (error) {
    logger.error('Не удалось обработать активности и координаты', error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
