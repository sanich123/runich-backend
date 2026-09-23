import { jest } from '@jest/globals';

const { createRunichMapStyle } = await import('../static-map.style');

describe('Runich static map style', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps only map context needed for routes and labels', async () => {
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

    expect(layers.poi).toBeUndefined();
    expect(layers['parking-area']).toBeUndefined();
    expect(layers['highway-name-minor']).toBeUndefined();
    expect(layers['highway-name-major']).toBeDefined();
    expect(style.sources).toEqual({
      openmaptiles: { type: 'vector', url: 'https://tiles.example/planet' },
      'runich-route': expect.objectContaining({ type: 'geojson' }),
    });
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
