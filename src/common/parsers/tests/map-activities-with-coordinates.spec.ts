import { jest } from '@jest/globals';
import { asyncMock, syncMock } from 'src/tests/helpers';
import type { LocationObject } from 'src/activity/activity.dto';

const parseCoordinatesFromFile = asyncMock();
const ungzipFile = asyncMock();
const getMapBoxImage = syncMock();
const getSpeedInMinsInKm = syncMock();
const uuid = syncMock();

jest.unstable_mockModule('../parse-coordinates-from-file', () => ({ parseCoordinatesFromFile }));
jest.unstable_mockModule('../ungzip', () => ({ ungzipFile }));
jest.unstable_mockModule('../get-mapbox-image', () => ({ getMapBoxImage }));
jest.unstable_mockModule('../get-speed', () => ({ getSpeedInMinsInKm }));
jest.unstable_mockModule('uuid', () => ({ v4: uuid }));

const { mapActivitiesWithCoordinates } = await import('../map-activities-with-coordinates');

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
  const originalMapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MAPBOX_ACCESS_TOKEN = 'mapbox-token';
    parseCoordinatesFromFile.mockResolvedValue(createRoute());
    getMapBoxImage.mockReturnValue('https://map.example/route');
    getSpeedInMinsInKm.mockReturnValue({ paceAsNumber: 6 });
    uuid.mockReturnValue('activity-1');
  });

  afterAll(() => {
    if (originalMapboxToken === undefined) delete process.env.MAPBOX_ACCESS_TOKEN;
    else process.env.MAPBOX_ACCESS_TOKEN = originalMapboxToken;
  });

  it('returns an empty result when the CSV rows are absent', async () => {
    await expect(mapActivitiesWithCoordinates({ userId: 'user-1', profileId: 'profile-1' })).resolves.toEqual([]);
  });

  it('returns kilometre splits from the full route and a capped route for storage', async () => {
    const [activity] = await mapActivitiesWithCoordinates({
      userId: 'user-1',
      profileId: 'profile-1',
      migrationDirectory: '/tmp/migration-job-1',
      parsedActivities: [
        {
          'Activity ID': 'strava-1',
          Filename: 'activities/run.gpx',
          'Activity Date': '2026-08-18T10:00:00.000Z',
          'Activity Name': 'Run',
          'Activity Type': 'Run',
          'Activity Description': '',
          'Elapsed Time': 300,
          'Moving Time': 240,
          Distance: 1_250,
        },
      ],
    });

    expect(activity.locations).toHaveLength(6);
    expect(activity.duration).toBe(240_000);
    expect(activity.kilometresSplit).toHaveLength(1);
    expect(activity.kilometresSplit?.[0].kilometerPoint.coords.longitude).toBeCloseTo(
      1_000 / METERS_PER_EQUATOR_DEGREE,
      5,
    );
    expect(activity.kilometresSplit?.[0].lastKilometerAltitude).toBeGreaterThan(0);
    expect(activity.mapPhotoUrl).toBe('https://map.example/route');
    expect(parseCoordinatesFromFile).toHaveBeenCalledWith('activities/run.gpx', '/tmp/migration-job-1');
    expect(getMapBoxImage).toHaveBeenCalledWith(createRoute());
  });

  it('returns an empty batch when every row is invalid so the worker can record skips and continue', async () => {
    await expect(
      mapActivitiesWithCoordinates({
        userId: 'user-1',
        profileId: 'profile-1',
        parsedActivities: [
          {
            'Activity ID': '',
            Filename: '',
            'Activity Date': '2026-09-07T00:00:00.000Z',
            'Activity Name': '',
            'Activity Type': 'Run',
            'Activity Description': '',
            'Elapsed Time': 0,
            Distance: 0,
          },
        ],
      }),
    ).resolves.toEqual([]);
  });

  it('uses elapsed time fallbacks and leaves non-route activities without a map image', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;

    const activities = await mapActivitiesWithCoordinates({
      userId: 'user-1',
      profileId: 'profile-1',
      parsedActivities: [
        {
          'Activity ID': 'strava-plain',
          Filename: 'activities/notes.json',
          'Activity Date': '2026-08-18T10:00:00.000Z',
          'Activity Type': undefined,
          'Moving Time': 'invalid',
          'Elapsed Time': 90,
          Distance: 'invalid',
        } as never,
        {
          'Activity ID': 'strava-zero',
          Filename: 'activities/notes.json',
          'Activity Date': '2026-08-18T10:00:00.000Z',
          'Moving Time': 'invalid',
          'Elapsed Time': 'invalid',
          Distance: 0,
        } as never,
      ],
    });

    expect(activities).toHaveLength(2);
    expect(activities[0].duration).toBe(90_000);
    expect(activities[0].sport).toBe('');
    expect(activities[0].mapPhotoUrl).toBe('');
    expect(activities[1].duration).toBe(0);
    expect(parseCoordinatesFromFile).not.toHaveBeenCalled();
    expect(getMapBoxImage).not.toHaveBeenCalled();
  });

  it('unzips and parses TCX routes before generating a map image', async () => {
    ungzipFile.mockResolvedValue(undefined);

    const [activity] = await mapActivitiesWithCoordinates({
      userId: 'user-1',
      profileId: 'profile-1',
      migrationDirectory: '/tmp/migration-job-2',
      parsedActivities: [
        {
          'Activity ID': 'strava-tcx',
          Filename: 'activities/run.tcx.gz',
          'Activity Date': '2026-08-18T10:00:00.000Z',
          'Activity Name': 'Run',
          'Activity Type': 'Run',
          'Activity Description': '',
          'Elapsed Time': 300,
          Distance: 1_250,
        },
      ],
    });

    expect(activity.mapPhotoUrl).toBe('https://map.example/route');
    expect(ungzipFile).toHaveBeenCalledWith('activities/run.tcx.gz', '/tmp/migration-job-2');
    expect(parseCoordinatesFromFile).toHaveBeenCalledWith('activities/run.tcx', '/tmp/migration-job-2');
  });

  it('parses FIT routes but skips the map when the route has one point', async () => {
    parseCoordinatesFromFile.mockResolvedValueOnce([createRoute()[0]]);

    const [activity] = await mapActivitiesWithCoordinates({
      userId: 'user-1',
      profileId: 'profile-1',
      migrationDirectory: '/tmp/migration-job-3',
      parsedActivities: [
        {
          'Activity ID': 'strava-fit',
          Filename: 'activities/run.fit',
          'Activity Date': '2026-08-18T10:00:00.000Z',
          'Activity Name': 'Run',
          'Activity Type': 'Run',
          'Activity Description': '',
          'Elapsed Time': 300,
          Distance: 1_250,
        },
      ],
    });

    expect(activity.locations).toHaveLength(1);
    expect(activity.mapPhotoUrl).toBe('');
    expect(parseCoordinatesFromFile).toHaveBeenCalledWith('activities/run.fit', '/tmp/migration-job-3');
    expect(getMapBoxImage).not.toHaveBeenCalled();
  });

  it('does not generate a map when no Mapbox token is configured for a route', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;

    const [activity] = await mapActivitiesWithCoordinates({
      userId: 'user-1',
      profileId: 'profile-1',
      parsedActivities: [
        {
          'Activity ID': 'strava-no-map',
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

    expect(activity.mapPhotoUrl).toBe('');
    expect(getMapBoxImage).not.toHaveBeenCalled();
  });
});
