import { jest } from '@jest/globals';
import { asyncMock } from 'src/__tests__/helpers';

const readFile = asyncMock();
const importFromFit = asyncMock();

jest.unstable_mockModule('fs/promises', () => ({ readFile }));
jest.unstable_mockModule('@ardentcode/sports-lib', () => ({ SportsLib: { importFromFit } }));

const { getCoordinatesFromFitFile } = await import('./get-coordinates-from-fit');

describe('getCoordinatesFromFitFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readFile.mockResolvedValue(Buffer.from('fit'));
    importFromFit.mockResolvedValue({
      getActivities: () => [
        {
          startDate: new Date(1_000_000),
          getAllStreams: () => [{ type: 'Altitude', getData: () => [100, 101, 102] }],
          getPositionData: () => [
            { latitudeDegrees: 55, longitudeDegrees: 37 },
            null,
            { latitudeDegrees: 55.001, longitudeDegrees: 37.001 },
          ],
        },
      ],
    });
  });

  it('preserves the one-second FIT stream timing when filtering invalid positions', async () => {
    await expect(getCoordinatesFromFitFile('/tmp/activity.fit')).resolves.toEqual([
      {
        coords: {
          latitude: 55,
          longitude: 37,
          altitude: 100,
          timestamp: 1_000_000,
        },
      },
      {
        coords: {
          latitude: 55.001,
          longitude: 37.001,
          altitude: 102,
          timestamp: 1_002_000,
        },
      },
    ]);
  });
});
