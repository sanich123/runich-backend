import { parse } from 'csv-parse';
import { finished } from 'stream/promises';
import { createReadStream } from 'node:fs';

export async function parseCsvFileIntoArray() {
  const records = [];
  const parser = createReadStream('dist/migration/activities.csv').pipe(parse({ columns: true }));
  parser.on('readable', function () {
    let record;
    while ((record = parser.read()) !== null) {
      records.push(record);
    }
  });
  await finished(parser);
  return records;
}
