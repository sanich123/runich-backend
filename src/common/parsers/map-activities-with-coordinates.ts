import { extname } from 'path';
import { parseCoordinatesFromFile } from './parse-coordinates-from-file';
import { ungzipFile } from './ungzip';
import { getMapBoxImage } from './get-mapbox-image';
import { getSpeedInMinsInKm } from './get-speed';
import { Extensions, RawStravaCsvColumns } from './types';
import { v4 } from 'uuid';
import { ActivityDto, LocationObject } from 'src/activity/activity.dto';
import { Logger } from '@nestjs/common';

const logger = new Logger('ActivityMapper');

type MigratedActivity = ActivityDto & { id: string; user_id: string; profileId: string };
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

    const results = await Promise.allSettled(
      parsedActivities.map(async (activity, i): Promise<MigratedActivity> => {
        let locations: LocationObject[] = [];
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
          locations = await parseCoordinatesFromFile(fileName);
        }
        logger.debug(`Processing activity ${i + 1}`);

        const duration = Number(activity['Elapsed Time']) * 1000;
        const distance = Number(activity.Distance);
        const title = activity['Activity Name'];
        const sport = activity['Activity Type'].toLowerCase();
        const description = activity['Activity Description'];
        const date = new Date(activity['Activity Date']).toISOString();
        const speed = getSpeedInMinsInKm(distance, duration).paceAsNumber;
        const mapPhotoUrl = locations.length > 1 ? getMapBoxImage(locations) : '';

        return {
          id: v4(),
          date,
          title,
          sport,
          description,
          duration,
          distance,
          speed,
          locations,
          user_id: userId,
          mapPhotoUrl,
          profileId,
        };
      }),
    );

    const failedResults = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    failedResults.forEach((result) => {
      logger.warn(`Skipping activity that could not be mapped: ${String(result.reason)}`);
    });

    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<MigratedActivity> => result.status === 'fulfilled')
      .map((result) => result.value);

    if (parsedActivities.length > 0 && successfulResults.length === 0 && failedResults.length > 0) {
      throw new Error('Could not map any activities from migration archive');
    }

    return successfulResults;
  } catch (error) {
    logger.error('Failed to map activities with coordinates', error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
