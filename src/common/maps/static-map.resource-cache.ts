import { STATIC_MAP_RESOURCE_CACHE_DEFAULT_TTL_MS, STATIC_MAP_RESOURCE_CACHE_MAX_BYTES } from './static-map.constants';

export type MapResourceResponse = {
  data: Uint8Array;
  modified?: Date;
  expires?: Date;
  etag?: string;
};

type LoadedMapResource = {
  response: MapResourceResponse;
  ttlMs?: number;
};

type CacheEntry = {
  response: MapResourceResponse;
  expiresAt: number;
  size: number;
};

const resourceCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<MapResourceResponse>>();
let cachedBytes = 0;

export async function getCachedMapResource(
  url: string,
  load: () => Promise<LoadedMapResource>,
): Promise<MapResourceResponse> {
  const cached = getFreshCacheEntry(url);
  if (cached) return cached.response;

  const inFlight = inFlightRequests.get(url);
  if (inFlight) return inFlight;

  const request = load()
    .then(({ response, ttlMs }) => {
      putCacheEntry(url, response, ttlMs ?? STATIC_MAP_RESOURCE_CACHE_DEFAULT_TTL_MS);
      return response;
    })
    .finally(() => {
      inFlightRequests.delete(url);
    });

  inFlightRequests.set(url, request);
  return request;
}

export function clearMapResourceCache() {
  resourceCache.clear();
  cachedBytes = 0;
}

function getFreshCacheEntry(url: string) {
  const entry = resourceCache.get(url);
  if (!entry) return undefined;

  if (entry.expiresAt <= Date.now()) {
    deleteCacheEntry(url, entry);
    return undefined;
  }

  resourceCache.delete(url);
  resourceCache.set(url, entry);
  return entry;
}

function putCacheEntry(url: string, response: MapResourceResponse, ttlMs: number) {
  const size = response.data.byteLength;
  const existing = resourceCache.get(url);
  if (existing) deleteCacheEntry(url, existing);

  if (ttlMs <= 0 || size > STATIC_MAP_RESOURCE_CACHE_MAX_BYTES) return;

  resourceCache.set(url, {
    response,
    expiresAt: Date.now() + ttlMs,
    size,
  });
  cachedBytes += size;

  while (cachedBytes > STATIC_MAP_RESOURCE_CACHE_MAX_BYTES) {
    const oldest = resourceCache.entries().next().value as [string, CacheEntry] | undefined;
    if (!oldest) break;
    deleteCacheEntry(oldest[0], oldest[1]);
  }
}

function deleteCacheEntry(url: string, entry: CacheEntry) {
  resourceCache.delete(url);
  cachedBytes -= entry.size;
}
