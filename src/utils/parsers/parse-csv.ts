let csvToJson = require('convert-csv-to-json');

export async function parseCsvToJson() {
  return csvToJson
    .fieldDelimiter(',')
    .parseSubArray('*', ',')
    .supportQuotedField(true)
    .formatValueByType(true)
    .getJsonFromCsv('dist/migration/archiveToSend/activities.csv');
}
