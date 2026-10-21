import sharp from 'sharp';
import { renderRouteOnlyMap } from '../static-map.route-only';

const route = [
  { coords: { longitude: 37.61, latitude: 55.75 } },
  { coords: { longitude: Number.NaN, latitude: 55.75 } },
  { coords: { longitude: 37.61, latitude: Number.NaN } },
  { coords: { longitude: -181, latitude: 55.75 } },
  { coords: { longitude: 181, latitude: 55.75 } },
  { coords: { longitude: 37.61, latitude: -91 } },
  { coords: { longitude: 37.61, latitude: 91 } },
  { coords: { longitude: 37.62, latitude: 55.76 } },
];

describe('route-only static map renderer', () => {
  it('renders a dark route image and ignores invalid coordinates', async () => {
    const image = await renderRouteOnlyMap(route);

    await expect(sharp(image).metadata()).resolves.toEqual(
      expect.objectContaining({ format: 'webp', width: 896, height: 538 }),
    );
  });

  it('rejects routes without any valid coordinates', async () => {
    await expect(renderRouteOnlyMap(route.slice(1, -1))).rejects.toThrow('Для route-only static map нужен маршрут');
  });
});
