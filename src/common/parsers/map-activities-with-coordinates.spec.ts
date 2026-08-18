import { jest } from '@jest/globals';
import { asyncMock, syncMock } from 'src/__tests__/helpers';
import type { LocationObject } from 'src/activity/activity.dto';

const parseCoordinatesFromFile = asyncMock();
const ungzipFile = asyncMock();
const getMapBoxImage = syncMock();
const getSpeedInMinsInKm = syncMock();
const uuid = syncMock();

jest.unstable_mockModule('./parse-coordinates-from-file', () => ({ parseCoordinatesFromFile }));
jest.unstable_mockModule('./ungzip', () => ({ ungzipFile }));
jest.unstable_mockModule('./get-mapbox-image', () => ({ getMapBoxImage }));
jest.unstable_mockModule('./get-speed', () => ({ getSpeedInMinsInKm }));
jest.unstable_mockModule('uuid', () => ({ v4: uuid }));

const { mapActivitiesWithCoordinates } = await import('./map-activities-with-coordinates');

const METERS_PER_EQUATOR_DEGREE = 111_195.080233;

function createRoute(): LocationObject[] {
  return [0, 250, 500, 750, 1000, 1250].map((meters, index) => ({
    coords: {
      latitude: 0,
      longitude: meters / METERS_PER_EQUATOR_DEGREE,
      altitude: 100 + index * 5,
      timestamp: index * 60_000,
    },
  }));
}

describe('mapActivitiesWithCoordinates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    parseCoordinatesFromFile.mockResolvedValue(createRoute());
    getMapBoxImage.mockReturnValue('https://map.example/route');
    getSpeedInMinsInKm.mockReturnValue({ paceAsNumber: 6 });
    uuid.mockReturnValue('activity-1');
  });

  it('returns kilometre splits from the full route and a capped route for storage', async () => {
    const [activity] = await mapActivitiesWithCoordinates({
      userId: 'user-1',
      profileId: 'profile-1',
      parsedActivities: [
        {
          'Activity ID': 'strava-1',
          Filename: 'activities/run.gpx',
          'Activity Date': '2026-08-18T10:00:00.000Z',
          'Activity Name': 'Run',
          'Activity Type': 'Run',
          'Activity Description': '',
          'Elapsed Time': 300,
          Distance: 1_250,
        },
      ],
    });

    expect(activity.locations).toHaveLength(6);
    expect(activity.kilometresSplit).toHaveLength(1);
    expect(activity.kilometresSplit?.[0].kilometerPoint.coords.longitude).toBeCloseTo(
      1_000 / METERS_PER_EQUATOR_DEGREE,
      5,
    );
    expect(activity.kilometresSplit?.[0].lastKilometerAltitude).toBeGreaterThan(0);
    expect(activity.mapPhotoUrl).toBe('https://map.example/route');
    expect(getMapBoxImage).toHaveBeenCalledWith(createRoute());
  });
});
