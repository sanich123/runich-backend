import {
  STATIC_MAP_ROUTE_WIDTH,
  STATIC_MAP_ROUTE_CASING_WIDTH,
  STATIC_MAP_VECTOR_STYLE_TIMEOUT_MS,
  STATIC_MAP_VECTOR_STYLE_URL,
  STATIC_MAP_TILE_USER_AGENT,
} from './static-map.constants';

type MapStyleLayer = {
  id: string;
  type: string;
  source?: string;
  'source-layer'?: string;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  filter?: unknown;
  [key: string]: unknown;
};

export type RunichMapStyle = {
  version: number;
  sources: Record<string, unknown>;
  layers: MapStyleLayer[];
  [key: string]: unknown;
};

let baseStylePromise: Promise<RunichMapStyle> | undefined;

export async function createRunichMapStyle(route: [number, number][]) {
  const baseStyle = await getBaseStyle();
  const style = structuredClone(baseStyle);
  const requiredLayers = insertAdditionalNaturalLayers(
    style.layers.filter(isRequiredLayer).map(enhanceMapLayer),
    findVectorSourceId(style.layers),
  );
  const usedSourceIds = new Set(requiredLayers.map((layer) => layer.source).filter(Boolean));
  style.sources = Object.fromEntries(Object.entries(style.sources).filter(([sourceId]) => usedSourceIds.has(sourceId)));

  style.sources['runich-route'] = {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: route },
    },
  };
  style.layers = [
    ...requiredLayers,
    {
      id: 'runich-route-casing',
      type: 'line',
      source: 'runich-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#FFFFFF',
        'line-opacity': 0.9,
        'line-width': STATIC_MAP_ROUTE_CASING_WIDTH,
        'line-blur': 0.2,
      },
    },
    {
      id: 'runich-route',
      type: 'line',
      source: 'runich-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#F66767',
        'line-opacity': 0.95,
        'line-width': STATIC_MAP_ROUTE_WIDTH,
        'line-blur': 0.1,
      },
    },
  ];

  return style;
}

function getBaseStyle() {
  if (!baseStylePromise) {
    baseStylePromise = fetchBaseStyle().catch((error) => {
      baseStylePromise = undefined;
      throw error;
    });
  }

  return baseStylePromise;
}

async function fetchBaseStyle(): Promise<RunichMapStyle> {
  const response = await fetch(STATIC_MAP_VECTOR_STYLE_URL, {
    headers: { 'user-agent': STATIC_MAP_TILE_USER_AGENT },
    signal: AbortSignal.timeout(STATIC_MAP_VECTOR_STYLE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Vector map style вернул HTTP ${response.status}`);

  const style = (await response.json()) as RunichMapStyle;
  if (!style.sources || !Array.isArray(style.layers)) {
    throw new Error('Vector map style имеет некорректную структуру');
  }

  return style;
}

function isRequiredLayer(layer: MapStyleLayer) {
  const id = layer.id.toLowerCase();
  const sourceLayer = layer['source-layer']?.toLowerCase();

  if (id === 'background') return true;
  if (sourceLayer === 'park' || sourceLayer === 'water' || sourceLayer === 'waterway') return true;
  if (sourceLayer === 'landcover') return id === 'landcover_wood';
  if (sourceLayer === 'landuse') return id === 'landuse_residential';
  if (sourceLayer === 'boundary') return id === 'boundary_2' || id === 'boundary_3';
  if (sourceLayer === 'transportation') {
    return [
      'highway_path',
      'highway_minor',
      'highway_major_casing',
      'highway_major_inner',
      'highway_major_subtle',
      'highway_motorway_casing',
      'highway_motorway_inner',
      'highway_motorway_subtle',
    ].includes(id);
  }
  if (sourceLayer === 'transportation_name') return id === 'highway-name-major';
  if (sourceLayer === 'place') {
    return ['label_city', 'label_city_capital', 'label_town', 'label_village'].includes(id);
  }

  return false;
}

function enhanceMapLayer(layer: MapStyleLayer): MapStyleLayer {
  if (layer.id === 'park') {
    return {
      ...layer,
      paint: { ...layer.paint, 'fill-color': '#B8DCA8' },
    };
  }

  if (layer.id === 'landcover_wood') {
    return {
      ...layer,
      paint: { ...layer.paint, 'fill-color': '#A3D486' },
    };
  }

  if (layer.id === 'water') {
    return {
      ...layer,
      paint: { ...layer.paint, 'fill-color': '#B9DDF2' },
    };
  }

  if (layer.id === 'waterway') {
    return {
      ...layer,
      paint: { ...layer.paint, 'line-color': '#73B8DF', 'line-opacity': 0.9 },
    };
  }

  if (layer.id === 'highway_path') {
    return {
      ...layer,
      paint: { ...layer.paint, 'line-color': '#D1B48A' },
    };
  }

  if (layer.id === 'highway_major_casing') {
    return {
      ...layer,
      paint: { ...layer.paint, 'line-color': '#E2B36E' },
    };
  }

  if (layer.id === 'highway_major_inner') {
    return {
      ...layer,
      paint: { ...layer.paint, 'line-color': '#FFF0C9' },
    };
  }

  if (layer.id === 'highway_major_subtle') {
    return {
      ...layer,
      paint: { ...layer.paint, 'line-color': '#D9A45E' },
    };
  }

  if (layer.id === 'highway_motorway_casing') {
    return {
      ...layer,
      paint: { ...layer.paint, 'line-color': '#D9954D' },
    };
  }

  if (layer.id === 'highway_motorway_inner') {
    return {
      ...layer,
      paint: { ...layer.paint, 'line-color': '#FFE5A3' },
    };
  }

  if (layer.id === 'highway_motorway_subtle') {
    return {
      ...layer,
      paint: { ...layer.paint, 'line-color': '#CC8F4C' },
    };
  }

  return layer;
}

function findVectorSourceId(layers: MapStyleLayer[]) {
  return layers.find((layer) => layer['source-layer'] === 'landcover' || layer['source-layer'] === 'landuse')?.source;
}

function insertAdditionalNaturalLayers(layers: MapStyleLayer[], source: string | undefined) {
  if (!source) return layers;

  const additionalLayers: MapStyleLayer[] = [
    {
      id: 'runich-landcover-grass',
      type: 'fill',
      source,
      'source-layer': 'landcover',
      minzoom: 8,
      filter: ['all', polygonFilter(), ['==', ['get', 'class'], 'grass']],
      paint: { 'fill-color': '#DDEDBA', 'fill-opacity': 0.7 },
    },
    {
      id: 'runich-landcover-wetland',
      type: 'fill',
      source,
      'source-layer': 'landcover',
      minzoom: 10,
      filter: ['all', polygonFilter(), ['==', ['get', 'class'], 'wetland']],
      paint: { 'fill-color': '#C9E0C2', 'fill-opacity': 0.75 },
    },
    {
      id: 'runich-landuse-cemetery',
      type: 'fill',
      source,
      'source-layer': 'landuse',
      filter: ['all', polygonFilter(), ['==', ['get', 'class'], 'cemetery']],
      paint: { 'fill-color': '#D5E6C8', 'fill-opacity': 0.8 },
    },
  ];
  const firstRoadLayerIndex = layers.findIndex((layer) => layer['source-layer'] === 'transportation');
  const insertAt = firstRoadLayerIndex >= 0 ? firstRoadLayerIndex : layers.length;

  return [...layers.slice(0, insertAt), ...additionalLayers, ...layers.slice(insertAt)];
}

function polygonFilter() {
  return ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false];
}
