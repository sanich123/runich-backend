export type RawStravaCsvColumns = {
  'Activity ID': string;
  Filename: string;
  'Activity Date': string;
  'Activity Name': string;
  'Activity Type': string;
  'Activity Description': string;
  'Elapsed Time': number;
  Distance: number;
};

export enum Extensions {
  gz = '.gz',
  fit = '.fit',
  tcx = '.tcx',
  gpx = '.gpx',
}
