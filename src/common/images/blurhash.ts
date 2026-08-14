import { encode } from 'blurhash';
import sharp from 'sharp';

const BLURHASH_WIDTH = 32;
const BLURHASH_HEIGHT = 32;

export async function blurhashFromUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;

    const image = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(BLURHASH_WIDTH, BLURHASH_HEIGHT, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return encode(new Uint8ClampedArray(image.data), image.info.width, image.info.height, 4, 3);
  } catch {
    return null;
  }
}
