import { extname } from 'path';
import { readFileParseGpx } from './parse-gpx';
import { ungzipFile } from './ungzip';
import { getMapBoxImage } from './get-mapbox-image';
import { getSpeedInMinsInKm } from './get-speed';

export async function mapActivitiesWithGpxTcxFitData(
  parsedActivities: {
    Filename: string;
    'Activity Date': string;
    'Activity Name': string;
    'Activity Type': string;
    'Activity Description': string;
    'Elapsed Time': number;
    Distance: number;
  }[],
  userId: string,
) {
  try {
    return await Promise.all(
      parsedActivities.map(async (activity, i) => {
        let locations;
        if (activity['Filename']) {
          if (extname(activity['Filename']) === '.gpx') {
            locations = await readFileParseGpx(activity['Filename']);
          } else {
            const fileNameWithoutGz = activity['Filename'].slice(0, -3);
            await ungzipFile(`dist/migration/${activity['Filename']}`, `dist/migration/${fileNameWithoutGz}`);
            locations = await readFileParseGpx(fileNameWithoutGz);
          }
          console.log('Обрабатываем активность номер', i);
          const duration = Number(activity['Elapsed Time']) * 1000;
          const distance = Number(activity.Distance);

          return {
            date: new Date(activity['Activity Date']).toString(),
            title: activity['Activity Name'],
            sport: activity['Activity Type'],
            description: activity['Activity Description'],
            duration,
            distance,
            speed: getSpeedInMinsInKm(distance, duration).paceAsNumber,
            locations,
            user_id: userId,
            mapPhotoUrl: getMapBoxImage(locations),
          };
        }
      }),
    );
  } catch (error) {
    console.log(error);
  }
}
