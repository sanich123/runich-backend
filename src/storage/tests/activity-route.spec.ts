import { decodeActivityRoute, encodeActivityRoute, getActivityRouteKey } from '../activity-route';

describe('activity route storage format', () => {
  it('compresses route points into a versioned compact payload and restores them', async () => {
    const locations = [
      {
        timestamp: 1_700_000_000_000,
        coords: {
          latitude: 55.75,
          longitude: 37.61,
          altitude: 120,
          accuracy: 4,
          altitudeAccuracy: 2,
          heading: 90,
          speed: 3.5,
          mocked: false,
        },
      },
      { coords: { latitude: 55.76, longitude: 37.62 } },
    ];

    const encoded = await encodeActivityRoute(locations);
    const decoded = await decodeActivityRoute(encoded.body);

    expect(encoded.metadata).toEqual({
      formatVersion: 1,
      pointCount: 2,
      sizeBytes: expect.any(Number),
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(decoded).toEqual(locations);
  });

  it('keeps activity routes under the user prefix for account cleanup', () => {
    expect(getActivityRouteKey('user-1', 'activity-1')).toBe('user-1/activities/activity-1/route-v1.json.gz');
  });
});
