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
  const hiddenLayers = style.layers.map((layer) => (shouldHideLayer(layer) ? hideLayer(layer) : layer));

  style.sources['runich-route'] = {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: route },
    },
  };
  style.layers = [
    ...hiddenLayers,
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

function shouldHideLayer(layer: MapStyleLayer) {
  const id = layer.id.toLowerCase();
  const sourceLayer = layer['source-layer']?.toLowerCase();

  if (sourceLayer === 'poi' || id.includes('poi') || id.includes('parking')) return true;
  if (sourceLayer === 'landuse' && containsString(layer.filter, 'parking')) return true;
  if (sourceLayer === 'transportation_name') return id === 'highway-name-major' ? false : true;

  return new Set([
    'airport',
    'label_other',
    'highway-shield-non-us',
    'highway-shield-us-interstate',
    'road_shield_us',
  ]).has(id);
}

function hideLayer(layer: MapStyleLayer): MapStyleLayer {
  return { ...layer, layout: { ...layer.layout, visibility: 'none' } };
}

function containsString(value: unknown, expected: string): boolean {
  if (typeof value === 'string') return value === expected;
  if (Array.isArray(value)) return value.some((item) => containsString(item, expected));
  return false;
}
