import { jest } from '@jest/globals';
import sharp from 'sharp';

const StaticMaps = jest.fn<() => unknown>();
jest.unstable_mockModule('staticmaps', () => ({ default: StaticMaps }));
const renderRunichVectorMap = jest.fn<() => Promise<Buffer>>().mockRejectedValue(new Error('vector renderer unavailable'));
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
    StaticMaps.mockReset();
    renderRunichVectorMap.mockReset().mockRejectedValue(new Error('vector renderer unavailable'));
  });

  it('calculates a static map bounding box from the full route', () => {
    expect(
      calculateStaticMapBbox([
        [37.62, 55.76],
        [37.61, 55.75],
        [37.63, 55.74],
      ]),
    ).toEqual([37.61, 55.74, 37.63, 55.76]);
  });

  it('calculates a fractional viewport while keeping tile zoom integer', () => {
    const viewport = calculateStaticMapViewport([
      [37.61, 55.75],
      [37.62, 55.76],
    ]);

    expect(viewport.zoom).toBeGreaterThan(viewport.tileZoom);
    expect(viewport.tileZoom).toBe(Math.floor(viewport.zoom) - 1);
    expect(viewport.scale).toBeGreaterThan(2);
    expect(viewport.crop.width).toBeLessThan(896);
    expect(viewport.crop.height).toBeLessThan(538);
  });

  it('renders an OSM map without endpoint markers and uploads the normalized WebP', async () => {
    const renderedPng = await sharp({
      create: { width: 896, height: 538, channels: 4, background: '#E5E5E5' },
    })
      .png()
      .toBuffer();
    const map = {
      addLine: jest.fn(),
      addMarker: jest.fn(),
      render: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      image: { image: renderedPng },
    };
    StaticMaps.mockImplementation(() => map);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } }));
    const storage = {
      uploadObject: jest
        .fn<
          (
            key: string,
            body: Buffer,
            contentType: string,
            cacheControl?: string,
          ) => Promise<{ key: string; url: string }>
        >()
        .mockResolvedValue({ key: 'user-1/activities/activity-1/map.webp', url: 'https://s3/map.webp' }),
    };
    const service = new StaticMapService(storage as never);

    const result = await service.generateActivityMap({
      userId: 'user-1',
      activityId: 'activity-1',
      locations,
    });

    expect(result).toEqual({ key: 'user-1/activities/activity-1/map.webp', url: 'https://s3/map.webp' });
    const route = locations.map(({ coords }) => [coords.longitude, coords.latitude] as [number, number]);
    const viewport = calculateStaticMapViewport(route);
    expect(StaticMaps).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 896,
        height: 538,
        paddingX: 0,
        paddingY: 0,
        tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        zoomRange: { min: 1, max: 19 },
      }),
    );
    expect(map.addLine).toHaveBeenCalledWith({
      coords: [
        [37.61, 55.75],
        [37.62, 55.76],
      ],
      color: '#F66767',
      width: 8 / viewport.scale,
    });
    expect(map.addMarker).not.toHaveBeenCalled();
    expect(map.render).toHaveBeenCalledWith(viewport.center, viewport.tileZoom);
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

    await service.generateActivityMap({
      userId: 'user-1',
      activityId: 'activity-2',
      locations,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('renders the customized vector style before using raster fallbacks', async () => {
    const renderedPng = await sharp({
      create: { width: 896, height: 538, channels: 4, background: '#F4F4F4' },
    })
      .png()
      .toBuffer();
    renderRunichVectorMap.mockResolvedValueOnce(renderedPng);
    const storage = {
      uploadObject: jest
        .fn<() => Promise<{ key: string; url: string }>>()
        .mockResolvedValue({ key: 'map.webp', url: 'https://s3/map.webp' }),
    };
    const route = locations.map(({ coords }) => [coords.longitude, coords.latitude] as [number, number]);
    const viewport = calculateStaticMapViewport(route);

    await expect(
      new StaticMapService(storage as never).generateActivityMap({
        userId: 'user-1',
        activityId: 'activity-1',
        locations,
      }),
    ).resolves.toEqual({ key: 'map.webp', url: 'https://s3/map.webp' });

    expect(renderRunichVectorMap).toHaveBeenCalledWith(route, viewport.center, viewport.zoom);
    expect(StaticMaps).not.toHaveBeenCalled();
    expect(storage.uploadObject).toHaveBeenCalledWith(
      'user-1/activities/activity-1/map.webp',
      expect.any(Buffer),
      'image/webp',
      'public, max-age=31536000, immutable',
    );
  });

  it('temporarily rotates vector, staticmaps and Mapbox providers outside production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'local';
    process.env.STATIC_MAP_TEST_PROVIDER_ROTATION = 'true';
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';

    const renderedPng = await sharp({
      create: { width: 896, height: 538, channels: 4, background: '#F4F4F4' },
    })
      .png()
      .toBuffer();
    renderRunichVectorMap.mockResolvedValue(renderedPng);
    StaticMaps.mockImplementation(() => ({
      addLine: jest.fn(),
      addMarker: jest.fn(),
      render: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      image: { image: renderedPng },
    }));
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } }));

    const storage = {
      uploadObject: jest
        .fn<() => Promise<{ key: string; url: string }>>()
        .mockResolvedValue({ key: 'map.webp', url: 'https://s3/map.webp' }),
    };
    const service = new StaticMapService(storage as never);

    const vectorResult = await service.generateActivityMap({ userId: 'user-1', activityId: 'activity-1', locations });
    const staticMapsResult = await service.generateActivityMap({
      userId: 'user-1',
      activityId: 'activity-2',
      locations,
    });
    const mapboxResult = await service.generateActivityMap({ userId: 'user-1', activityId: 'activity-3', locations });

    expect(vectorResult).toEqual({ key: 'map.webp', url: 'https://s3/map.webp' });
    expect(staticMapsResult).toEqual({ key: 'map.webp', url: 'https://s3/map.webp' });
    expect(mapboxResult?.url).toContain('access_token=test-token');
    expect(renderRunichVectorMap).toHaveBeenCalledTimes(1);
    expect(StaticMaps).toHaveBeenCalledTimes(1);
    expect(storage.uploadObject).toHaveBeenCalledTimes(2);
  });

  it('downloads map tiles through fetch instead of staticmaps got requests', async () => {
    const renderedPng = await sharp({
      create: { width: 896, height: 538, channels: 4, background: '#E5E5E5' },
    })
      .png()
      .toBuffer();
    const map = {
      addLine: jest.fn(),
      addMarker: jest.fn(),
      render: jest.fn(async () => {
        const getTile = (map as unknown as { getTile?: (tile: unknown) => Promise<unknown> }).getTile;
        if (!getTile) throw new Error('Static map tile fetcher was not installed');
        await getTile({ url: 'https://tile.openstreetmap.org/1/0/0.png', box: [0, 0, 256, 256] });
      }),
      image: { image: renderedPng },
    };
    StaticMaps.mockImplementation(() => map);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
    });
    const storage = {
      uploadObject: jest
        .fn<() => Promise<{ key: string; url: string }>>()
        .mockResolvedValue({ key: 'map.webp', url: 'https://s3/map.webp' }),
    };

    await expect(
      new StaticMapService(storage as never).generateActivityMap({
        userId: 'user-1',
        activityId: 'activity-1',
        locations,
      }),
    ).resolves.toEqual({ key: 'map.webp', url: 'https://s3/map.webp' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ headers: { 'user-agent': 'Runich/1.0 (static map renderer)' } }),
    );
  });

  it('falls back when a tile download fails after the provider health check', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    const renderedPng = await sharp({
      create: { width: 896, height: 538, channels: 4, background: '#E5E5E5' },
    })
      .png()
      .toBuffer();
    const map = {
      addLine: jest.fn(),
      addMarker: jest.fn(),
      render: jest.fn(async () => {
        const getTile = (map as unknown as { getTile?: (tile: unknown) => Promise<unknown> }).getTile;
        await getTile?.({ url: 'https://tile.openstreetmap.org/1/0/0.png', box: [0, 0, 256, 256] });
      }),
      image: { buffer: jest.fn<() => Promise<Buffer>>().mockResolvedValue(renderedPng) },
    };
    StaticMaps.mockImplementation(() => map);
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } }),
      )
      .mockRejectedValueOnce(new Error('tile unavailable'));

    await expect(
      new StaticMapService({ uploadObject: jest.fn() } as never).generateActivityMap({
        userId: 'user-1',
        activityId: 'activity-1',
        locations,
      }),
    ).resolves.toEqual(expect.objectContaining({ url: expect.stringContaining('access_token=test-token') }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('handles non-Error failures while switching to Mapbox', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue('tile provider unavailable');

    await expect(
      new StaticMapService({ uploadObject: jest.fn() } as never).generateActivityMap({
        userId: 'user-1',
        activityId: 'activity-1',
        locations,
      }),
    ).resolves.toEqual(expect.objectContaining({ url: expect.stringContaining('access_token=test-token') }));
  });

  it('falls back to the legacy Mapbox URL when staticmaps fails', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    StaticMaps.mockImplementation(() => {
      throw new Error('tile server unavailable');
    });
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('tile server unavailable'));
    const storage = { uploadObject: jest.fn() };

    const result = await new StaticMapService(storage as never).generateActivityMap({
      userId: 'user-1',
      activityId: 'activity-1',
      locations,
    });

    expect(result?.url).toContain('path-8+F66767-0.8');
    expect(result?.url).not.toContain('pin-');
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('returns null when both the tile provider and Mapbox are unavailable', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    StaticMaps.mockImplementation(() => {
      throw new Error('renderer unavailable');
    });
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('tile provider unavailable'));

    await expect(
      new StaticMapService({ uploadObject: jest.fn() } as never).generateActivityMap({
        userId: 'user-1',
        activityId: 'activity-1',
        locations,
      }),
    ).resolves.toBeNull();
  });

  it('uses Mapbox when activity id is unavailable', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    const service = new StaticMapService({ uploadObject: jest.fn() } as never);

    await expect(service.generateActivityMap({ userId: 'user-1', locations })).resolves.toEqual(
      expect.objectContaining({ url: expect.stringContaining('access_token=test-token') }),
    );
  });

  it('temporarily blocks staticmaps after repeated failures', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('tile provider unavailable'));
    const service = new StaticMapService({ uploadObject: jest.fn() } as never);

    for (let index = 0; index < 5; index += 1) {
      await expect(
        service.generateActivityMap({ userId: 'user-1', activityId: 'activity-1', locations }),
      ).resolves.toEqual(expect.objectContaining({ url: expect.stringContaining('access_token=test-token') }));
    }
    await expect(
      service.generateActivityMap({ userId: 'user-1', activityId: 'activity-1', locations }),
    ).resolves.toEqual(expect.objectContaining({ url: expect.stringContaining('access_token=test-token') }));
  });

  it('falls back when the tile health endpoint returns a non-image response', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('not an image', { status: 200, headers: { 'content-type': 'text/plain' } }));

    const result = await new StaticMapService({ uploadObject: jest.fn() } as never).generateActivityMap({
      userId: 'user-1',
      activityId: 'activity-1',
      locations,
    });

    expect(result?.url).toContain('access_token=test-token');
    expect(StaticMaps).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    await expect(
      new StaticMapService({ uploadObject: jest.fn() } as never).generateActivityMap({
        userId: 'user-1',
        activityId: 'activity-1',
        locations,
      }),
    ).resolves.toEqual(expect.objectContaining({ url: expect.stringContaining('access_token=test-token') }));

    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      new StaticMapService({ uploadObject: jest.fn() } as never).generateActivityMap({
        userId: 'user-1',
        activityId: 'activity-1',
        locations,
      }),
    ).resolves.toEqual(expect.objectContaining({ url: expect.stringContaining('access_token=test-token') }));
  });

  it('skips empty routes and timed-out renders safely', async () => {
    const service = new StaticMapService({ uploadObject: jest.fn() } as never);
    await expect(
      service.generateActivityMap({ userId: 'user-1', activityId: 'activity-1', locations: [] }),
    ).resolves.toBeNull();

    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } }));
    StaticMaps.mockImplementation(() => ({
      addLine: jest.fn(),
      addMarker: jest.fn(),
      render: jest.fn(() => new Promise<void>(() => undefined)),
      image: { buffer: jest.fn() },
    }));

    jest.useFakeTimers();
    try {
      const result = service.generateActivityMap({ userId: 'user-1', activityId: 'activity-1', locations });
      await jest.advanceTimersByTimeAsync(15_000);
      await expect(result).resolves.toEqual(
        expect.objectContaining({ url: expect.stringContaining('access_token=test-token') }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('filters invalid coordinates and simplifies a route with Ramer-Douglas-Peucker', () => {
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
});
