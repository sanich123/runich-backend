import { jest } from '@jest/globals';

const existsSync = jest.fn<(...args: unknown[]) => boolean>();
const getCoordinatesFromFitFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getCoordinatesFromTcxFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getCoordinatesFromGpxFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('node:fs', () => ({ existsSync }));
jest.unstable_mockModule('./get-coordinates-from-fit', () => ({ getCoordinatesFromFitFile }));
jest.unstable_mockModule('./get-coordinates-from-tcx', () => ({ getCoordinatesFromTcxFile }));
jest.unstable_mockModule('./get-coordinates-from-gpx', () => ({ getCoordinatesFromGpxFile }));

const { parseCoordinatesFromFile } = await import('./parse-coordinates-from-file');

describe('parseCoordinatesFromFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    existsSync.mockReturnValue(true);
    getCoordinatesFromFitFile.mockResolvedValue([{ coords: { latitude: 1, longitude: 2 } }]);
    getCoordinatesFromTcxFile.mockResolvedValue([{ coords: { latitude: 3, longitude: 4 } }]);
    getCoordinatesFromGpxFile.mockResolvedValue([{ coords: { latitude: 5, longitude: 6 } }]);
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

  it('rejects files that are absent from the migration directory', async () => {
    existsSync.mockReturnValue(false);

    await expect(parseCoordinatesFromFile('missing.gpx')).rejects.toThrow('Файл с координатами не найден');
  });
});
