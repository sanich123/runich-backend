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
});
