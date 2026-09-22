import {
  STATIC_MAP_ROUTE_WIDTH,
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
  const requiredLayers = style.layers.filter(isRequiredLayer);
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
      id: 'runich-route',
      type: 'line',
      source: 'runich-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#F66767',
        'line-opacity': 0.95,
        'line-width': STATIC_MAP_ROUTE_WIDTH,
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
