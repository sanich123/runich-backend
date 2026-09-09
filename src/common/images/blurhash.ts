import { encode } from 'blurhash';
import sharp from 'sharp';
import type { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';

const BLURHASH_WIDTH = 32;
const BLURHASH_HEIGHT = 32;

function getImageService(url: string) {
  return url.includes('api.mapbox.com') ? 'mapbox' : 'image';
}

export async function blurhashFromUrl(url: string, latencyMetrics?: LatencyMetricsService): Promise<string | null> {
  try {
    const service = getImageService(url);
    const startedAt = performance.now();
    let imageBuffer: ArrayBuffer;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      imageBuffer = await response.arrayBuffer();
    } finally {
      latencyMetrics?.observeExternal(service, 'fetch', performance.now() - startedAt);
    }

    const image = await sharp(Buffer.from(imageBuffer))
      .resize(BLURHASH_WIDTH, BLURHASH_HEIGHT, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return encode(new Uint8ClampedArray(image.data), image.info.width, image.info.height, 4, 3);
  } catch {
    return null;
  }
}
