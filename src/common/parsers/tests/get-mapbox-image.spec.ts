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
  });
});
