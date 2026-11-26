import { jest } from '@jest/globals';

const existsSync = jest.fn<(...args: unknown[]) => boolean>();
const getCoordinatesFromFitFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseFitActivityFromFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getCoordinatesFromTcxFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getCoordinatesFromGpxFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseTcxActivityFromFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseGpxActivityFromFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('node:fs', () => ({ existsSync }));
jest.unstable_mockModule('../get-coordinates-from-fit', () => ({
  getCoordinatesFromFitFile,
  parseFitActivityFromFile,
}));
jest.unstable_mockModule('../get-coordinates-from-tcx', () => ({
  getCoordinatesFromTcxFile,
  parseTcxActivityFromFile,
}));
jest.unstable_mockModule('../get-coordinates-from-gpx', () => ({
  getCoordinatesFromGpxFile,
  parseGpxActivityFromFile,
}));

const { parseCoordinatesFromFile, parseFitActivityFromMigrationFile, parseActivityDataFromMigrationFile } =
  await import('../parse-coordinates-from-file');

describe('parseCoordinatesFromFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    existsSync.mockReturnValue(true);
    getCoordinatesFromFitFile.mockResolvedValue([{ coords: { latitude: 1, longitude: 2 } }]);
    parseFitActivityFromFile.mockResolvedValue({ locations: [], heartRateData: { samples: [] } });
    getCoordinatesFromTcxFile.mockResolvedValue([{ coords: { latitude: 3, longitude: 4 } }]);
    getCoordinatesFromGpxFile.mockResolvedValue([{ coords: { latitude: 5, longitude: 6 } }]);
    parseTcxActivityFromFile.mockResolvedValue({ locations: [], heartRateData: { samples: [] } });
    parseGpxActivityFromFile.mockResolvedValue({ locations: [], heartRateData: { samples: [] } });
  });

  it.each([
    ['activity.gpx', getCoordinatesFromGpxFile],
    ['activity.tcx', getCoordinatesFromTcxFile],
    ['activity.fit', getCoordinatesFromFitFile],
  ])('routes %s to the matching parser', async (filePath, parser) => {
    await expect(parseCoordinatesFromFile(filePath)).resolves.toHaveLength(1);
    expect(parser).toHaveBeenCalledWith(expect.stringContaining(`/dist/migration/${filePath}`));
  });

  it('returns an empty list for unsupported files', async () => {
    await expect(parseCoordinatesFromFile('activities.csv')).resolves.toEqual([]);
    expect(getCoordinatesFromFitFile).not.toHaveBeenCalled();
  });

  it('routes FIT migration files through the combined activity parser', async () => {
    await expect(parseFitActivityFromMigrationFile('activity.fit', '/tmp/migration')).resolves.toEqual({
      locations: [],
      heartRateData: { samples: [] },
    });

    expect(existsSync).toHaveBeenCalledWith('/tmp/migration/activity.fit');
    expect(parseFitActivityFromFile).toHaveBeenCalledWith('/tmp/migration/activity.fit');
  });

  it.each([
    ['activities/run.gpx', parseGpxActivityFromFile],
    ['activities/run.tcx', parseTcxActivityFromFile],
  ])('routes %s through a combined coordinates and heart-rate parser', async (filePath, parser) => {
    const parsedActivity = { locations: [{ coords: { latitude: 1, longitude: 2 } }], heartRateData: { samples: [] } };
    parser.mockResolvedValueOnce(parsedActivity);

    await expect(parseActivityDataFromMigrationFile(filePath, '/tmp/migration')).resolves.toEqual(parsedActivity);
    expect(existsSync).toHaveBeenCalledWith(`/tmp/migration/${filePath}`);
    expect(parser).toHaveBeenCalledWith(`/tmp/migration/${filePath}`);
  });

  it('routes FIT through its combined route and heart-rate parser', async () => {
    const parsedActivity = { locations: [], heartRateData: { samples: [] } };
    parseFitActivityFromFile.mockResolvedValueOnce(parsedActivity);

    await expect(parseActivityDataFromMigrationFile('activities/run.fit', '/tmp/migration')).resolves.toEqual(
      parsedActivity,
    );
    expect(parseFitActivityFromFile).toHaveBeenCalledWith('/tmp/migration/activities/run.fit');
  });

  it('returns empty activity data for unsupported migration files', async () => {
    await expect(parseActivityDataFromMigrationFile('activities/notes.json', '/tmp/migration')).resolves.toEqual({
      locations: [],
      heartRateData: { samples: [] },
    });
  });

  it('rejects combined parsing when the migration file is missing', async () => {
    existsSync.mockReturnValue(false);

    await expect(parseActivityDataFromMigrationFile('activities/missing.gpx', '/tmp/migration')).rejects.toThrow(
      'Файл с координатами не найден',
    );
  });

  it('rejects files that are absent from the migration directory', async () => {
    existsSync.mockReturnValue(false);

    await expect(parseCoordinatesFromFile('missing.gpx')).rejects.toThrow('Файл с координатами не найден');
  });
});
