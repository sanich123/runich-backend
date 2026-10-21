export type RawStravaCsvColumns = {
  'Activity ID': string;
  Filename: string;
  'Activity Date': string;
  'Activity Name': string;
  'Activity Type': string;
  'Activity Description': string;
  'Elapsed Time': number;
  'Moving Time'?: number;
  Distance: number;
  'Elevation Gain'?: number | string;
  'Average Heart Rate'?: number | string;
  'Max Heart Rate'?: number | string;
  Calories?: number | string;
};

export enum Extensions {
  gz = '.gz',
  fit = '.fit',
  tcx = '.tcx',
  gpx = '.gpx',
}
