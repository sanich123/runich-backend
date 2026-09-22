import { jest } from '@jest/globals';

const { createRunichMapStyle } = await import('../static-map.style');

describe('Runich static map style', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hides POI, parking and minor street labels while adding the route layer', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          version: 8,
          sources: { openmaptiles: { type: 'vector', url: 'https://tiles.example/planet' } },
          layers: [
            { id: 'poi', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi' },
            {
              id: 'parking-area',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'landuse',
              filter: ['==', ['get', 'class'], 'parking'],
            },
            {
              id: 'highway-name-minor',
              type: 'symbol',
              source: 'openmaptiles',
              'source-layer': 'transportation_name',
            },
            {
              id: 'highway-name-major',
              type: 'symbol',
              source: 'openmaptiles',
              'source-layer': 'transportation_name',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const style = await createRunichMapStyle([
      [37.61, 55.75],
      [37.62, 55.76],
    ]);
    const layers = Object.fromEntries(style.layers.map((layer) => [layer.id, layer]));

    expect(layers.poi.layout).toEqual({ visibility: 'none' });
    expect(layers['parking-area'].layout).toEqual({ visibility: 'none' });
    expect(layers['highway-name-minor'].layout).toEqual({ visibility: 'none' });
    expect(layers['highway-name-major'].layout).toBeUndefined();
    expect(layers['runich-route']).toEqual(
      expect.objectContaining({
        type: 'line',
        source: 'runich-route',
        paint: expect.objectContaining({ 'line-width': 8 }),
      }),
    );
    expect(style.sources['runich-route']).toEqual(
      expect.objectContaining({ type: 'geojson', data: expect.objectContaining({ type: 'Feature' }) }),
    );
  });
});
