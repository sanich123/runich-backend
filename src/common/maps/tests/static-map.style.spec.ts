import { jest } from '@jest/globals';

const { createRunichMapStyle } = await import('../static-map.style');

describe('Runich static map style', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clears a failed cached style so later requests can retry', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sources: { openmaptiles: {} } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    await expect(createRunichMapStyle([])).rejects.toThrow('HTTP 503');
    await expect(createRunichMapStyle([])).rejects.toThrow('некорректную структуру');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('works when the base style has no vector source or road layers', async () => {
    jest.resetModules();
    const { createRunichMapStyle: createFreshStyle } = await import('../static-map.style');
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          version: 8,
          sources: { unused: { type: 'vector' } },
          layers: [
            { id: 'background', type: 'background' },
            { id: 'poi', type: 'symbol' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const style = await createFreshStyle([]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(style.sources).toEqual({
      'runich-route': expect.objectContaining({ type: 'geojson' }),
    });
    expect(style.layers.map(({ id }) => id)).toEqual(['background', 'runich-route']);
  });

  it('keeps only map context needed for routes and labels', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          version: 8,
          sources: {
            openmaptiles: { type: 'vector', url: 'https://tiles.example/planet' },
            unused: { type: 'vector', url: 'https://tiles.example/unused' },
          },
          layers: [
            { id: 'poi', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi' },
            { id: 'background', type: 'background', source: 'openmaptiles' },
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
              id: 'landuse_residential',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'landuse',
            },
            { id: 'landcover_other', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover' },
            { id: 'boundary_2', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary' },
            { id: 'boundary_3', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary' },
            { id: 'boundary_1', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary' },
            { id: 'highway_major_subtle', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
            { id: 'highway_motorway_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
            { id: 'highway_motorway_inner', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
            { id: 'highway_motorway_subtle', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
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
            { id: 'label_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
            { id: 'label_city_capital', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
            { id: 'label_town', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
            { id: 'label_village', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
            { id: 'label_country', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const style = await createRunichMapStyle([
      [37.61, 55.75],
      [37.62, 55.76],
    ]);
    const cachedStyle = await createRunichMapStyle([[37.61, 55.75]]);
    const layers = Object.fromEntries(style.layers.map((layer) => [layer.id, layer]));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cachedStyle.sources['runich-route']).toBeDefined();
    expect(layers.poi).toBeUndefined();
    expect(layers['parking-area']).toBeUndefined();
    expect(layers['landcover_other']).toBeUndefined();
    expect(layers.boundary_1).toBeUndefined();
    expect(layers['highway-name-minor']).toBeUndefined();
    expect(layers['highway-name-major']).toBeDefined();
    expect(layers.background).toBeDefined();
    expect(layers.landuse_residential).toBeDefined();
    expect(layers.boundary_2).toBeDefined();
    expect(layers.boundary_3).toBeDefined();
    expect(layers.label_city).toBeDefined();
    expect(layers.label_city_capital).toBeDefined();
    expect(layers.label_town).toBeDefined();
    expect(layers.label_village).toBeDefined();
    expect(layers.label_country).toBeUndefined();
    expect(layers.park).toEqual(expect.objectContaining({ paint: { 'fill-color': '#B8DCA8' } }));
    expect(layers.landcover_wood).toEqual(expect.objectContaining({ paint: { 'fill-color': '#A3D486' } }));
    expect(layers.water).toEqual(expect.objectContaining({ paint: { 'fill-color': '#B9DDF2' } }));
    expect(layers.waterway).toEqual(
      expect.objectContaining({ paint: { 'line-color': '#73B8DF', 'line-opacity': 0.9 } }),
    );
    expect(layers.highway_path).toEqual(expect.objectContaining({ paint: { 'line-color': '#D1B48A' } }));
    expect(layers.highway_major_casing).toEqual(expect.objectContaining({ paint: { 'line-color': '#E2B36E' } }));
    expect(layers.highway_major_inner).toEqual(expect.objectContaining({ paint: { 'line-color': '#FFF0C9' } }));
    expect(layers.highway_major_subtle).toEqual(expect.objectContaining({ paint: { 'line-color': '#D9A45E' } }));
    expect(layers.highway_motorway_casing).toEqual(expect.objectContaining({ paint: { 'line-color': '#D9954D' } }));
    expect(layers.highway_motorway_inner).toEqual(expect.objectContaining({ paint: { 'line-color': '#FFE5A3' } }));
    expect(layers.highway_motorway_subtle).toEqual(expect.objectContaining({ paint: { 'line-color': '#CC8F4C' } }));
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
        paint: expect.objectContaining({ 'line-color': '#F26422', 'line-width': 6, 'line-blur': 0.1 }),
      }),
    );
    expect(layers['runich-route-casing']).toBeUndefined();
    expect(style.sources['runich-route']).toEqual(
      expect.objectContaining({ type: 'geojson', data: expect.objectContaining({ type: 'Feature' }) }),
    );
  });
});
