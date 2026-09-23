import { jest } from '@jest/globals';
import { clearMapResourceCache, getCachedMapResource } from '../static-map.resource-cache';

describe('Map resource cache', () => {
  afterEach(() => {
    clearMapResourceCache();
    jest.restoreAllMocks();
  });

  it('reuses a resource while it is fresh', async () => {
    const load = jest.fn(async () => ({ response: { data: Uint8Array.from([1, 2, 3]) }, ttlMs: 60_000 }));

    const first = await getCachedMapResource('https://tiles.example/1.pbf', load);
    const second = await getCachedMapResource('https://tiles.example/1.pbf', load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('deduplicates concurrent requests for the same resource', async () => {
    let resolveLoad!: (value: { response: { data: Uint8Array }; ttlMs: number }) => void;
    const loading = new Promise<{ response: { data: Uint8Array }; ttlMs: number }>((resolve) => {
      resolveLoad = resolve;
    });
    const load = jest.fn(() => loading);

    const first = getCachedMapResource('https://tiles.example/2.pbf', load);
    const second = getCachedMapResource('https://tiles.example/2.pbf', load);
    resolveLoad({ response: { data: Uint8Array.from([4, 5, 6]) }, ttlMs: 60_000 });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
