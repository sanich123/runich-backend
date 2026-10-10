export const STATIC_MAP_WIDTH = 896;
export const STATIC_MAP_HEIGHT = 538;
export const MAX_STATIC_MAP_LOCATIONS = 500;
export const STATIC_MAP_ROUTE_WIDTH = 6;
export const STATIC_MAP_ROUTE_COLOR = '#EA5B22';
export const STATIC_MAP_SIMPLIFICATION_TOLERANCE_METERS = 2;
// MapLibre vector sources use a 512px world at zoom 0. The viewport fit must
// use the same world scale as the native renderer, otherwise every map is
// rendered one zoom level too close.
export const STATIC_MAP_TILE_SIZE = 512;
export const STATIC_MAP_ZOOM_FIT_PADDING_PX = 8;
export const STATIC_MAP_WEBP_QUALITY = 84;
export const STATIC_MAP_WEBP_EFFORT = 4;
export const STATIC_MAP_VECTOR_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
export const STATIC_MAP_VECTOR_STYLE_TIMEOUT_MS = 7_000;
export const STATIC_MAP_VECTOR_REQUEST_TIMEOUT_MS = 7_000;
export const STATIC_MAP_VECTOR_RENDER_RATIO = 1;
export const STATIC_MAP_RESOURCE_CACHE_MAX_BYTES = 128 * 1024 * 1024;
export const STATIC_MAP_RESOURCE_CACHE_DEFAULT_TTL_MS = 60 * 60 * 1_000;
export const STATIC_MAP_TILE_USER_AGENT = 'Runich/1.0 (static map renderer)';
export const STATIC_MAP_RENDER_TIMEOUT_MS = 15_000;
export const STATIC_MAP_MIN_ZOOM = 1;
export const STATIC_MAP_MAX_ZOOM = 19;
export const STATIC_MAP_MAX_CONCURRENCY = 2;
export const STATIC_MAP_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const STATIC_MAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles · © OpenStreetMap contributors';
