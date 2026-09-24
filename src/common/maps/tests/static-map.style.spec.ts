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
              id: 'park',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'park',
              paint: { 'fill-color': 'rgb(230, 233, 229)' },
            },
            {
              id: 'landcover_wood',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'landcover',
              paint: { 'fill-color': 'rgb(220,224,220)' },
            },
            {
              id: 'water',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'water',
              paint: { 'fill-color': 'rgb(194, 200, 202)' },
            },
            {
              id: 'waterway',
              type: 'line',
              source: 'openmaptiles',
              'source-layer': 'waterway',
              paint: { 'line-color': 'hsl(195,17%,78%)' },
            },
            {
              id: 'highway_path',
              type: 'line',
              source: 'openmaptiles',
              'source-layer': 'transportation',
              paint: { 'line-color': 'rgb(234, 234, 234)' },
            },
            {
              id: 'highway_major_casing',
              type: 'line',
              source: 'openmaptiles',
              'source-layer': 'transportation',
              paint: { 'line-color': 'rgb(213, 213, 213)' },
            },
            {
              id: 'highway_major_inner',
              type: 'line',
              source: 'openmaptiles',
              'source-layer': 'transportation',
              paint: { 'line-color': '#fff' },
            },
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
    expect(layers.park).toEqual(expect.objectContaining({ paint: { 'fill-color': '#B8DCA8' } }));
    expect(layers.landcover_wood).toEqual(expect.objectContaining({ paint: { 'fill-color': '#A3D486' } }));
    expect(layers.water).toEqual(expect.objectContaining({ paint: { 'fill-color': '#B9DDF2' } }));
    expect(layers.waterway).toEqual(
      expect.objectContaining({ paint: { 'line-color': '#73B8DF', 'line-opacity': 0.9 } }),
    );
    expect(layers.highway_path).toEqual(expect.objectContaining({ paint: { 'line-color': '#D1B48A' } }));
    expect(layers.highway_major_casing).toEqual(expect.objectContaining({ paint: { 'line-color': '#E2B36E' } }));
    expect(layers.highway_major_inner).toEqual(expect.objectContaining({ paint: { 'line-color': '#FFF0C9' } }));
    expect(layers['runich-landcover-grass']).toEqual(
      expect.objectContaining({ paint: { 'fill-color': '#DDEDBA', 'fill-opacity': 0.7 } }),
    );
    expect(layers['runich-landcover-wetland']).toEqual(
      expect.objectContaining({ paint: { 'fill-color': '#C9E0C2', 'fill-opacity': 0.75 } }),
    );
    expect(layers['runich-landuse-cemetery']).toEqual(
      expect.objectContaining({ paint: { 'fill-color': '#D5E6C8', 'fill-opacity': 0.8 } }),
    );
    expect(style.sources).toEqual({
      openmaptiles: { type: 'vector', url: 'https://tiles.example/planet' },
      'runich-route': expect.objectContaining({ type: 'geojson' }),
    });
    expect(layers['runich-route']).toEqual(
      expect.objectContaining({
        type: 'line',
        source: 'runich-route',
        paint: expect.objectContaining({ 'line-width': 5, 'line-blur': 0.1 }),
      }),
    );
    expect(layers['runich-route-casing']).toEqual(
      expect.objectContaining({
        type: 'line',
        source: 'runich-route',
        paint: expect.objectContaining({ 'line-width': 8, 'line-blur': 0.2 }),
      }),
    );
    expect(style.sources['runich-route']).toEqual(
      expect.objectContaining({ type: 'geojson', data: expect.objectContaining({ type: 'Feature' }) }),
    );
  });
});
