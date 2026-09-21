import { getMapBoxImage } from '../get-mapbox-image';

describe('getMapBoxImage', () => {
  const originalToken = process.env.MAPBOX_ACCESS_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.MAPBOX_ACCESS_TOKEN;
    else process.env.MAPBOX_ACCESS_TOKEN = originalToken;
  });

  it('requires a Mapbox access token', () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;

    expect(() => getMapBoxImage([])).toThrow('MAPBOX_ACCESS_TOKEN');
  });

  it('disables Mapbox attribution and logo for static images', () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';

    const imageUrl = getMapBoxImage([
      { coords: { latitude: 55.75, longitude: 37.61 } },
      { coords: { latitude: 55.76, longitude: 37.62 } },
    ]);

    expect(imageUrl).toContain('?access_token=test-token&attribution=false&logo=false');
    expect(imageUrl).toContain('/896x504@2x');
    expect(imageUrl).toContain('pin-s+2ACB37(37.61,55.75)');
    expect(imageUrl).toContain('pin-s+EC653C(37.62,55.76)');
  });

  it('keeps the old route reduction before calculating the auto bounds', () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';

    const imageUrl = getMapBoxImage(
      Array.from({ length: 1_000 }, (_, index) => ({
        coords: { latitude: 55.75 + index / 100_000, longitude: 37.61 + index / 100_000 },
      })),
    );

    expect(imageUrl).toContain('/896x504@2x');
    expect(imageUrl).toContain('pin-s+2ACB37(37.61,55.75)');
    expect(imageUrl).toContain('pin-s+EC653C(37.61999,55.75999)');
    expect(imageUrl.length).toBeLessThanOrEqual(7600);
  });
});
