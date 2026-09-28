import sharp from 'sharp';
import type { LocationObject } from 'src/activity/activity.dto';
import {
  calculateStaticMapViewport,
  createAttributionOverlay,
  getErrorMessage,
  normalizeStaticMapLocations,
  simplifyStaticMapLocations,
  validateStaticMap,
  withTimeout,
} from '../static-map.utils';

function location(latitude: number, longitude: number): LocationObject {
  return { coords: { latitude, longitude } };
}

describe('static map utilities', () => {
  it('filters invalid coordinates while preserving valid boundary coordinates', () => {
    const locations = [
      location(-90, -180),
      location(90, 180),
      location(0, 180.001),
      location(-90.001, 0),
      location(Number.NaN, 0),
      location(0, Number.POSITIVE_INFINITY),
    ];

    expect(normalizeStaticMapLocations(locations)).toEqual(locations.slice(0, 2));
  });

  it('uses the minimum and maximum zoom when the route is outside or inside the fit bounds', () => {
    expect(() => calculateStaticMapViewport([])).toThrow('нужен маршрут');

    const worldRoute = calculateStaticMapViewport([
      [-170, -70],
      [170, 70],
    ]);
    const pointRoute = calculateStaticMapViewport([
      [37.61, 55.75],
      [37.610001, 55.750001],
    ]);

    expect(worldRoute.zoom).toBe(1);
    expect(pointRoute.zoom).toBe(19);
    expect(pointRoute.center[0]).toBeCloseTo(37.6100005, 5);
  });

  it('retains required route extremes when a requested simplification limit is impossible', () => {
    const locations = [location(0, 0), location(0.001, 0), location(0, 0), location(-0.001, 0), location(0, 0)];

    const simplified = simplifyStaticMapLocations(locations, 2);

    expect(simplified[0]).toBe(locations[0]);
    expect(simplified.at(-1)).toBe(locations.at(-1));
    expect(simplified.length).toBeGreaterThan(2);
  });

  it('escapes the attribution text and exposes useful error messages', () => {
    expect(createAttributionOverlay().toString()).toContain('OpenFreeMap');
    expect(getErrorMessage(new Error('map failed'))).toBe('map failed');
    expect(getErrorMessage({ reason: 'map failed' })).toBe('[object Object]');
  });

  it('accepts only non-trivial WebP images with the expected dimensions', async () => {
    const tinyWebp = await sharp({
      create: { width: 896, height: 538, channels: 3, background: '#fff' },
    })
      .webp()
      .toBuffer();
    const wrongWidthWebp = await sharp({
      create: { width: 895, height: 538, channels: 3, background: '#fff' },
    })
      .webp()
      .toBuffer();
    const validWebp = await sharp(
      Buffer.from(
        `<svg width="896" height="538" xmlns="http://www.w3.org/2000/svg">${Array.from(
          { length: 24 },
          (_, index) => `<path d="M0 ${index * 23}H896" stroke="#${(index * 7919).toString(16).padStart(6, '0')}"/>`,
        ).join('')}</svg>`,
      ),
    )
      .webp()
      .toBuffer();

    await expect(validateStaticMap(wrongWidthWebp)).rejects.toThrow('некорректного размера или формата');
    if (tinyWebp.byteLength < 1_000) {
      await expect(validateStaticMap(tinyWebp)).rejects.toThrow('некорректного размера или формата');
    }
    await expect(validateStaticMap(validWebp)).resolves.toBeUndefined();
  });

  it('resolves before timeout and rejects a promise that takes too long', async () => {
    await expect(withTimeout(Promise.resolve('ready'), 50, 'timeout')).resolves.toBe('ready');
    await expect(withTimeout(new Promise(() => {}), 1, 'map render timed out')).rejects.toThrow('map render timed out');
  });
});
