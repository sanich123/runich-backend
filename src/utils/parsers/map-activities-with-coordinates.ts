import { extname } from 'path';
import { parseCoordinatesFromFile } from './parse-coordinates-from-file';
import { ungzipFile } from './ungzip';
import { getMapBoxImage } from './get-mapbox-image';
import { getSpeedInMinsInKm } from './get-speed';
import { Extensions, RawStravaCsvColumns } from './types';

export async function mapActivitiesWithCoordinates(parsedActivities: RawStravaCsvColumns[], userId: string) {
  try {
    return await Promise.all(
      parsedActivities.map(async (activity, i) => {
        let locations;
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
        } else {
          locations = [];
        }
        console.log('Обрабатываем активность номер', i);

        const duration = Number(activity['Elapsed Time']) * 1000;
        const distance = Number(activity.Distance);
        const title = activity['Activity Name'];
        const sport = activity['Activity Type'].toLowerCase();
        const description = activity['Activity Description'];
        const date = new Date(activity['Activity Date']).toISOString();
        const speed = getSpeedInMinsInKm(distance, duration).paceAsNumber;
        const mapPhotoUrl = locations?.length > 1 ? getMapBoxImage(locations) : '';

        return {
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
        };
      }),
    );
  } catch (error) {
    console.log('An error occured while mapping activities with coordinates', error);
  }
}
