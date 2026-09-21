import { jest } from '@jest/globals';
import sharp from 'sharp';

const StaticMaps = jest.fn<() => unknown>();
jest.unstable_mockModule('staticmaps', () => ({ default: StaticMaps }));

const { StaticMapService } = await import('../static-map.service');
const { calculateStaticMapBbox, normalizeStaticMapLocations } = await import('../static-map.utils');

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

  it('renders an OSM map, adds A/B markers, and uploads the normalized WebP', async () => {
    const renderedPng = await sharp({
      create: { width: 896, height: 504, channels: 4, background: '#E5E5E5' },
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
    const bbox = calculateStaticMapBbox(route);
    expect(StaticMaps).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 896,
        height: 504,
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
      width: 2,
    });
    expect(map.addMarker).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        coord: [37.61, 55.75],
        img: expect.stringMatching(/start-marker\.png$/),
        width: 28,
        height: 32,
        drawWidth: 27,
        drawHeight: 31,
        resizeMode: 'fill',
      }),
    );
    expect(map.addMarker).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        coord: [37.62, 55.76],
        img: expect.stringMatching(/finish-marker\.png$/),
        width: 28,
        height: 32,
        drawWidth: 27,
        drawHeight: 31,
        resizeMode: 'fill',
      }),
    );
    expect(map.render).toHaveBeenCalledWith(bbox);
    expect(storage.uploadObject).toHaveBeenCalledWith(
      'user-1/activities/activity-1/map.webp',
      expect.any(Buffer),
      'image/webp',
      'public, max-age=31536000, immutable',
    );
    const uploadedImage = storage.uploadObject.mock.calls[0][1] as Buffer;
    await expect(sharp(uploadedImage).metadata()).resolves.toEqual(
      expect.objectContaining({ format: 'webp', width: 896, height: 504 }),
    );

    await service.generateActivityMap({
      userId: 'user-1',
      activityId: 'activity-2',
      locations,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('downloads map tiles through fetch instead of staticmaps got requests', async () => {
    const renderedPng = await sharp({
      create: { width: 896, height: 504, channels: 4, background: '#E5E5E5' },
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
      create: { width: 896, height: 504, channels: 4, background: '#E5E5E5' },
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

    expect(result?.url).toContain('pin-s-a+000(37.61,55.75)');
    expect(result?.url).toContain('pin-s-b+000(37.62,55.76)');
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

  it('filters invalid coordinates and keeps both route endpoints when reducing a route', () => {
    const route = Array.from({ length: 700 }, (_, index) => ({
      coords: { latitude: 55 + index / 100_000, longitude: 37 + index / 100_000 },
    }));
    route.splice(20, 0, { coords: { latitude: Number.NaN, longitude: 37 } });

    const normalized = normalizeStaticMapLocations(route);

    expect(normalized).toHaveLength(500);
    expect(normalized[0]).toEqual(route[0]);
    expect(normalized.at(-1)).toEqual(route.at(-1));
  });
});
