import { createRequire } from 'node:module';
import sharp from 'sharp';
import {
  STATIC_MAP_HEIGHT,
  STATIC_MAP_RENDER_TIMEOUT_MS,
  STATIC_MAP_TILE_USER_AGENT,
  STATIC_MAP_VECTOR_RENDER_RATIO,
  STATIC_MAP_VECTOR_REQUEST_TIMEOUT_MS,
  STATIC_MAP_WIDTH,
  STATIC_MAP_WEBP_EFFORT,
  STATIC_MAP_WEBP_QUALITY,
} from './static-map.constants';
import { createRunichMapStyle } from './static-map.style';
import { getCachedMapResource, type MapResourceResponse } from './static-map.resource-cache';
import { createAttributionOverlay, getErrorMessage, withTimeout } from './static-map.utils';

type NativeMap = {
  load: (style: unknown) => void;
  render: (
    options: {
      width: number;
      height: number;
      center: [number, number];
      zoom: number;
    },
    callback: (error: Error | undefined, buffer: Uint8Array | undefined) => void,
  ) => void;
  release: () => void;
};

type NativeMapConstructor = new (options: {
  ratio: number;
  request: (request: { url: string }, callback: (error?: Error, response?: MapResourceResponse) => void) => void;
}) => NativeMap;

type MapLibreNativeModule = { Map: NativeMapConstructor };

const require = createRequire(import.meta.url);

export async function renderRunichVectorMap(route: [number, number][], center: [number, number], zoom: number) {
  const style = await createRunichMapStyle(route);
  const { Map } = require('@maplibre/maplibre-gl-native') as MapLibreNativeModule;
  // MapLibre Native applies the pixel ratio to the camera scale as well as to the output buffer.
  // Compensate it so the geographic viewport stays equal to the calculated fractional viewport.
  const renderZoom = calculateVectorRenderZoom(zoom);
  const map = new Map({
    ratio: STATIC_MAP_VECTOR_RENDER_RATIO,
    request: (request, callback) => {
      void requestMapResource(request.url, callback);
    },
  });

  try {
    map.load(style);
    const rawImage = await withTimeout(
      new Promise<Buffer>((resolve, reject) => {
        map.render(
          { width: STATIC_MAP_WIDTH, height: STATIC_MAP_HEIGHT, center, zoom: renderZoom },
          (error, buffer) => {
            if (error) {
              reject(error);
              return;
            }
            if (!buffer) {
              reject(new Error('MapLibre не вернул буфер изображения'));
              return;
            }
            resolve(Buffer.from(buffer));
          },
        );
      }),
      STATIC_MAP_RENDER_TIMEOUT_MS,
      'Превышено время генерации vector static map',
    );
    const rawWidth = STATIC_MAP_WIDTH * STATIC_MAP_VECTOR_RENDER_RATIO;
    const rawHeight = STATIC_MAP_HEIGHT * STATIC_MAP_VECTOR_RENDER_RATIO;
    if (rawImage.byteLength !== rawWidth * rawHeight * 4) {
      throw new Error(`MapLibre вернул буфер неожиданного размера: ${rawImage.byteLength}`);
    }

    return await sharp(rawImage, { raw: { width: rawWidth, height: rawHeight, channels: 4 } })
      .resize({ width: STATIC_MAP_WIDTH, height: STATIC_MAP_HEIGHT, fit: 'fill' })
      .composite([{ input: createAttributionOverlay(), left: 0, top: 0 }])
      .webp({ quality: STATIC_MAP_WEBP_QUALITY, effort: STATIC_MAP_WEBP_EFFORT, smartSubsample: true })
      .toBuffer();
  } finally {
    map.release();
  }
}

export function calculateVectorRenderZoom(zoom: number) {
  return zoom - Math.log2(STATIC_MAP_VECTOR_RENDER_RATIO);
}

async function requestMapResource(url: string, callback: (error?: Error, response?: MapResourceResponse) => void) {
  void getCachedMapResource(url, () => fetchMapResource(url))
    .then((response) => callback(undefined, response))
    .catch((error) => callback(new Error(getErrorMessage(error))));
}

async function fetchMapResource(url: string) {
  const response = await fetch(url, {
    headers: { 'user-agent': STATIC_MAP_TILE_USER_AGENT },
    signal: AbortSignal.timeout(STATIC_MAP_VECTOR_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`MapLibre resource вернул HTTP ${response.status}: ${url}`);

  return {
    response: {
      data: Buffer.from(await response.arrayBuffer()),
      etag: response.headers.get('etag') ?? undefined,
      modified: parseHeaderDate(response.headers.get('last-modified')),
      expires: parseHeaderDate(response.headers.get('expires')),
    },
    ttlMs: getCacheTtlMs(response.headers),
  };
}

function getCacheTtlMs(headers: Headers) {
  const cacheControl = headers.get('cache-control') ?? '';
  if (/\b(?:no-store|no-cache)\b/i.test(cacheControl)) return 0;

  const maxAge = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1];
  if (maxAge) return Number(maxAge) * 1_000;

  const expires = parseHeaderDate(headers.get('expires'));
  if (expires) return Math.max(0, expires.valueOf() - Date.now());

  return undefined;
}

function parseHeaderDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}
