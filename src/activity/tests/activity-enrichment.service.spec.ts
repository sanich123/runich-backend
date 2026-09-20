import { jest } from '@jest/globals';
import { asyncMock } from 'src/tests/helpers';
import { ActivityEnrichmentService } from '../activity-enrichment.service';

function createPrismaMock() {
  return {
    activity: {
      findMany: asyncMock(),
      updateMany: asyncMock(),
      update: asyncMock(),
    },
  };
}

function createStorageMock() {
  return { readActivityRoute: asyncMock() };
}

function createActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'activity-1',
    routeStorageKey: 'activities/activity-1/locations.json.gz',
    kilometresSplit: null,
    date: new Date('2026-09-19T08:35:00.000Z'),
    timeZone: 'Europe/Moscow',
    ...overrides,
  };
}

function jsonResponse(payload: unknown, ok = true) {
  return { ok, status: ok ? 200 : 502, json: async () => payload } as Response;
}

describe('ActivityEnrichmentService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns false when there are no queued activities', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    prisma.activity.findMany.mockResolvedValue([]);

    await expect(service.processNextBatch()).resolves.toBe(false);
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });

  it('stores historical weather without reverse geocoding', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    prisma.activity.findMany.mockResolvedValue([createActivity()]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    storage.readActivityRoute.mockResolvedValue([{ coords: { latitude: 55.75, longitude: 37.61 } }]);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        hourly: {
          time: ['2026-09-19T11:00'],
          temperature_2m: [18],
          wind_speed_10m: [6],
          weather_code: [0],
        },
      }),
    );

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('weather_code'), expect.any(Object));
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('api.mapbox.com'), expect.any(Object));
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: {
        weatherTemperature: 18,
        weatherWindSpeed: 6,
        weatherCode: 0,
        locationEnrichmentStatus: 'completed',
      },
    });
  });

  it('completes without a valid route coordinate', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    prisma.activity.findMany.mockResolvedValue([createActivity()]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(global, 'fetch');
    storage.readActivityRoute.mockResolvedValue([
      null,
      { coords: null },
      { coords: { latitude: 56, longitude: 38, mocked: true } },
    ]);

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: {
        weatherTemperature: null,
        weatherWindSpeed: null,
        weatherCode: null,
        locationEnrichmentStatus: 'completed',
      },
    });
  });

  it('uses the first valid kilometre split when a route object is unavailable', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    prisma.activity.findMany.mockResolvedValue([
      createActivity({
        routeStorageKey: null,
        timeZone: 'not-a-time-zone',
        kilometresSplit: [
          null,
          {},
          { kilometerPoint: {} },
          { kilometerPoint: { coords: null } },
          { kilometerPoint: { coords: { latitude: 91, longitude: 37 } } },
          { kilometerPoint: { coords: { latitude: 55.75, longitude: 37.61 } } },
        ],
      }),
    ]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ hourly: { time: [] } }));

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(storage.readActivityRoute).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('timezone=UTC'), expect.any(Object));
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: {
        weatherTemperature: null,
        weatherWindSpeed: null,
        weatherCode: null,
        locationEnrichmentStatus: 'completed',
      },
    });
  });

  it('completes without weather when kilometre splits are missing', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    prisma.activity.findMany.mockResolvedValue([createActivity({ routeStorageKey: null, kilometresSplit: null })]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(global, 'fetch');

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(storage.readActivityRoute).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: {
        weatherTemperature: null,
        weatherWindSpeed: null,
        weatherCode: null,
        locationEnrichmentStatus: 'completed',
      },
    });
  });

  it('skips an activity claimed by another worker', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    prisma.activity.findMany.mockResolvedValue([createActivity()]);
    prisma.activity.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(storage.readActivityRoute).not.toHaveBeenCalled();
    expect(prisma.activity.update).not.toHaveBeenCalled();
  });

  it('completes with null weather values when the weather API fails', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    prisma.activity.findMany.mockResolvedValue([createActivity()]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    storage.readActivityRoute.mockResolvedValue([{ coords: { latitude: 55.75, longitude: 37.61 } }]);
    jest.spyOn(global, 'fetch').mockRejectedValueOnce('Open-Meteo unavailable');

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: {
        weatherTemperature: null,
        weatherWindSpeed: null,
        weatherCode: null,
        locationEnrichmentStatus: 'completed',
      },
    });
  });

  it('completes with null weather values when the weather API responds with an error', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    prisma.activity.findMany.mockResolvedValue([createActivity()]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    storage.readActivityRoute.mockResolvedValue([{ coords: { latitude: 55.75, longitude: 37.61 } }]);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({}, false));

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: {
        weatherTemperature: null,
        weatherWindSpeed: null,
        weatherCode: null,
        locationEnrichmentStatus: 'completed',
      },
    });
  });

  it('marks an activity completed when reading its route fails', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    prisma.activity.findMany.mockResolvedValue([createActivity()]);
    prisma.activity.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    storage.readActivityRoute.mockRejectedValue('route unavailable');

    await expect(service.processNextBatch()).resolves.toBe(true);

    expect(prisma.activity.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'activity-1', locationEnrichmentStatus: 'processing' },
      data: {
        weatherTemperature: null,
        weatherWindSpeed: null,
        weatherCode: null,
        locationEnrichmentStatus: 'completed',
      },
    });
  });

  it('keeps only finite weather values', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    prisma.activity.findMany.mockResolvedValue([createActivity()]);
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    storage.readActivityRoute.mockResolvedValue([{ coords: { latitude: 55.75, longitude: 37.61 } }]);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        hourly: {
          time: ['2026-09-19T11:00'],
          temperature_2m: ['18'],
          wind_speed_10m: [Number.POSITIVE_INFINITY],
          weather_code: [0],
        },
      }),
    );

    await service.processNextBatch();

    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: expect.objectContaining({
        weatherTemperature: null,
        weatherWindSpeed: null,
        weatherCode: 0,
      }),
    });
  });

  it('waits between empty worker polls and then stops', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    Object.defineProperty(service, 'pollIntervalMs', { value: 0 });
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    jest
      .spyOn(service, 'processNextBatch')
      .mockResolvedValueOnce(false)
      .mockImplementationOnce(async () => {
        service.requestStop();
        return true;
      });

    const worker = service.runWorker();
    await expect(worker).resolves.toBeUndefined();

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { locationEnrichmentStatus: 'processing' },
      data: { locationEnrichmentStatus: 'queued' },
    });
  });

  it('continues polling after a worker error', async () => {
    const prisma = createPrismaMock();
    const storage = createStorageMock();
    const service = new ActivityEnrichmentService(prisma as never, storage as never);
    Object.defineProperty(service, 'pollIntervalMs', { value: 0 });
    prisma.activity.updateMany.mockResolvedValue({ count: 1 });
    jest
      .spyOn(service, 'processNextBatch')
      .mockRejectedValueOnce(new Error('poll failed'))
      .mockImplementationOnce(async () => {
        service.requestStop();
        return true;
      });

    const worker = service.runWorker();
    await expect(worker).resolves.toBeUndefined();
  });
});
