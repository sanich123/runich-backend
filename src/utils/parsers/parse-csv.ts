import { parse } from 'csv-parse';
import { finished } from 'stream/promises';
import { createReadStream } from 'node:fs';
import { existsSync } from 'fs';

export async function parseCsvFileIntoArray() {
  const records = [];
  const csvFileToParse = 'dist/migration/activities.csv';

  try {
    if (!existsSync(csvFileToParse)) {
      throw new Error('Сsv file doesnt exists! Nothing to parse');
    }
    const parser = createReadStream(csvFileToParse).pipe(parse({ columns: true }));
    parser.on('readable', function () {
      let record;
      while ((record = parser.read()) !== null) {
        records.push(record);
      }
    });
    await finished(parser);
    return records;
  } catch (error) {
    console.log('Error while parse csv file', error);
  }
}
