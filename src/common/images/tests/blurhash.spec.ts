import { jest } from '@jest/globals';

const encode = jest.fn<(...args: unknown[]) => string>();
const sharp = jest.fn<(...args: unknown[]) => unknown>();
jest.unstable_mockModule('blurhash', () => ({ encode }));
jest.unstable_mockModule('sharp', () => ({ default: sharp }));

const { blurhashFromUrl } = await import('../blurhash');

describe('blurhashFromUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    encode.mockReturnValue('blurhash-value');
    sharp.mockReturnValue({
      resize: jest.fn().mockReturnThis(),
      ensureAlpha: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ data: Buffer.from([1, 2, 3, 4]), info: { width: 1, height: 1 } }),
    });
  });

  it('returns null for an unsuccessful image response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

    await expect(blurhashFromUrl('https://example.com/image.jpg')).resolves.toBeNull();
    expect(sharp).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('resizes a successful image and creates a blurhash', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const metrics = { observeExternal: jest.fn() };

    await expect(blurhashFromUrl('https://api.mapbox.com/styles/v1/map/image.jpg', metrics as never)).resolves.toBe(
      'blurhash-value',
    );
    expect(sharp).toHaveBeenCalledWith(expect.any(Buffer));
    expect(encode).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 1, 1, 4, 3);
    expect(metrics.observeExternal).toHaveBeenCalledWith('mapbox', 'fetch', expect.any(Number));
    jest.restoreAllMocks();
  });

  it('returns null when downloading or processing the image fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'));

    await expect(blurhashFromUrl('https://example.com/image.jpg')).resolves.toBeNull();
    jest.restoreAllMocks();
  });
});
