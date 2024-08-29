import { extname } from 'path';
import { readFileParseGpx } from './parse-gpx';
import { ungzipFile } from './ungzip';

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
          console.log('Обрабатываем ', i, ' активность');
          return {
            date: activity['Activity Date'],
            title: activity['Activity Name'],
            sport: activity['Activity Type'],
            description: activity['Activity Description'],
            duration: activity['Elapsed Time'],
            distance: activity.Distance,
            locations,
          };
        }
      }),
    );
  } catch (error) {
    console.log(error);
  }
}
