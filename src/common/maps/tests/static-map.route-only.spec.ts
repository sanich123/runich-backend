import sharp from 'sharp';
import { renderRouteOnlyMap } from '../static-map.route-only';
import { makeMoscowCoordinate, makeNearbyMoscowCoordinate } from 'src/tests/fixtures/geography.fixtures';

const route = [
  { coords: makeMoscowCoordinate() },
  { coords: makeMoscowCoordinate({ longitude: Number.NaN }) },
  { coords: makeMoscowCoordinate({ latitude: Number.NaN }) },
  { coords: makeMoscowCoordinate({ longitude: -181 }) },
  { coords: makeMoscowCoordinate({ longitude: 181 }) },
  { coords: makeMoscowCoordinate({ latitude: -91 }) },
  { coords: makeMoscowCoordinate({ latitude: 91 }) },
  { coords: makeNearbyMoscowCoordinate() },
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
