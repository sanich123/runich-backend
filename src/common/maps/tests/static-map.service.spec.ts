import { jest } from '@jest/globals';
import sharp from 'sharp';

const renderRunichVectorMap = jest.fn<() => Promise<Buffer>>();
jest.unstable_mockModule('../static-map.vector', () => ({ renderRunichVectorMap }));

const { StaticMapService } = await import('../static-map.service');
const { calculateStaticMapBbox, calculateStaticMapViewport, normalizeStaticMapLocations } =
  await import('../static-map.utils');

const locations = [
  { coords: { latitude: 55.75, longitude: 37.61 } },
  { coords: { latitude: 55.76, longitude: 37.62 } },
];

describe('StaticMapService', () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.restoreAllMocks();
    jest.clearAllMocks();
    renderRunichVectorMap.mockReset();
  });

  it('uses MapLibre first and uploads the rendered route image', async () => {
    const renderedWebp = await createRenderedWebp();
    renderRunichVectorMap.mockResolvedValue(renderedWebp);
    const storage = createStorage();
    const service = new StaticMapService(storage as never);
    const route = locations.map(({ coords }) => [coords.longitude, coords.latitude] as [number, number]);
    const viewport = calculateStaticMapViewport(route);

    await expect(
      service.generateActivityMap({ userId: 'user-1', activityId: 'activity-1', locations }),
    ).resolves.toEqual({ key: 'map.webp', url: 'https://s3/map.webp' });

    expect(renderRunichVectorMap).toHaveBeenCalledWith(route, viewport.center, viewport.zoom);
    expect(storage.uploadObject).toHaveBeenCalledWith(
      'user-1/activities/activity-1/map.webp',
      expect.any(Buffer),
      'image/webp',
      'public, max-age=31536000, immutable',
    );
    const uploadedImage = storage.uploadObject.mock.calls[0][1] as Buffer;
    await expect(sharp(uploadedImage).metadata()).resolves.toEqual(
      expect.objectContaining({ format: 'webp', width: 896, height: 538 }),
    );
  });

  it('uses the Mapbox URL when MapLibre rendering fails', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    renderRunichVectorMap.mockRejectedValue(new Error('vector renderer unavailable'));
    const storage = createStorage();

    const result = await new StaticMapService(storage as never).generateActivityMap({
      userId: 'user-1',
      activityId: 'activity-1',
      locations,
    });

    expect(result?.url).toContain('access_token=test-token');
    expect(result?.url).toContain('path-8+F66767-0.8');
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('uses Mapbox when an activity id is unavailable for vector storage', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';

    await expect(
      new StaticMapService(createStorage() as never).generateActivityMap({ userId: 'user-1', locations }),
    ).resolves.toEqual(expect.objectContaining({ url: expect.stringContaining('access_token=test-token') }));

    expect(renderRunichVectorMap).not.toHaveBeenCalled();
  });

  it('returns null when both MapLibre and Mapbox are unavailable', async () => {
    renderRunichVectorMap.mockRejectedValue(new Error('vector renderer unavailable'));

    await expect(
      new StaticMapService(createStorage() as never).generateActivityMap({
        userId: 'user-1',
        activityId: 'activity-1',
        locations,
      }),
    ).resolves.toBeNull();
  });

  it('skips empty routes and filters invalid coordinates', async () => {
    const service = new StaticMapService(createStorage() as never);
    await expect(
      service.generateActivityMap({ userId: 'user-1', activityId: 'activity-1', locations: [] }),
    ).resolves.toBeNull();

    const route = Array.from({ length: 700 }, (_, index) => ({
      coords: { latitude: 55 + index / 100_000, longitude: 37 + index / 100_000 },
    }));
    route.splice(20, 0, { coords: { latitude: Number.NaN, longitude: 37 } });

    const normalized = normalizeStaticMapLocations(route);
    const validRoute = route.filter(
      ({ coords }) => Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude),
    );
    const normalizedRoute = normalized.map(({ coords }) => [coords.longitude, coords.latitude] as [number, number]);

    expect(normalized.length).toBeLessThanOrEqual(500);
    expect(normalized.length).toBeGreaterThanOrEqual(2);
    expect(normalized[0]).toEqual(route[0]);
    expect(normalized.at(-1)).toEqual(route.at(-1));
    expect(calculateStaticMapBbox(normalizedRoute)).toEqual(
      calculateStaticMapBbox(validRoute.map(({ coords }) => [coords.longitude, coords.latitude] as [number, number])),
    );
  });

  it('calculates a vector viewport from the full route', () => {
    const viewport = calculateStaticMapViewport([
      [37.61, 55.75],
      [37.62, 55.76],
    ]);

    expect(viewport.zoom).toBeGreaterThan(1);
    expect(viewport.zoom).toBeLessThanOrEqual(19);
    expect(viewport.center[0]).toBeCloseTo(37.615, 3);
    expect(viewport.center[1]).toBeCloseTo(55.755, 3);
  });

  it('uses MapLibre vector world scale when fitting the route zoom', () => {
    const viewport = calculateStaticMapViewport([
      [37.300755, 55.624046],
      [37.411966, 55.674324],
    ]);

    expect(viewport.zoom).toBeCloseTo(12.0081159, 5);
    expect(viewport.center[0]).toBeCloseTo(37.3563605, 5);
    expect(viewport.center[1]).toBeCloseTo(55.6491931, 5);
  });
});

async function createRenderedWebp() {
  const lines = Array.from(
    { length: 24 },
    (_, index) => `<path d="M0 ${index * 23}H896" stroke="#${(index * 7919).toString(16).padStart(6, '0')}"/>`,
  ).join('');
  return sharp(Buffer.from(`<svg width="896" height="538" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`))
    .webp()
    .toBuffer();
}

function createStorage() {
  return {
    uploadObject: jest
      .fn<
        (key: string, body: Buffer, contentType: string, cacheControl?: string) => Promise<{ key: string; url: string }>
      >()
      .mockResolvedValue({ key: 'map.webp', url: 'https://s3/map.webp' }),
  };
}
