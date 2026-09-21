import { join } from 'node:path';

export const STATIC_MAP_WIDTH = 896;
export const STATIC_MAP_HEIGHT = 504;
export const MAX_STATIC_MAP_LOCATIONS = 500;
export const STATIC_MAP_ROUTE_WIDTH = 2;
export const STATIC_MAP_MARKER_WIDTH = 28;
export const STATIC_MAP_MARKER_HEIGHT = 32;
export const STATIC_MAP_WEBP_QUALITY = 84;
export const STATIC_MAP_WEBP_EFFORT = 4;
export const STATIC_MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const STATIC_MAP_TILE_USER_AGENT = 'Runich/1.0 (static map renderer)';
export const STATIC_MAP_TILE_TIMEOUT_MS = 7_000;
export const STATIC_MAP_RENDER_TIMEOUT_MS = 15_000;
export const STATIC_MAP_TILE_REQUEST_LIMIT = 4;
export const STATIC_MAP_MIN_ZOOM = 1;
export const STATIC_MAP_MAX_ZOOM = 19;
export const STATIC_MAP_MAX_CONCURRENCY = 2;
export const STATIC_MAP_FAILURE_THRESHOLD = 5;
export const STATIC_MAP_FAILURE_COOLDOWN_MS = 60_000;
export const STATIC_MAP_TILE_HEALTH_CACHE_MS = 60_000;
export const STATIC_MAP_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const STATIC_MAP_ATTRIBUTION = '© OpenStreetMap contributors';
export const STATIC_MAP_START_MARKER = join(process.cwd(), 'assets/maps/start-marker.png');
export const STATIC_MAP_FINISH_MARKER = join(process.cwd(), 'assets/maps/finish-marker.png');

export const STATIC_MAP_TILE_HEADERS = {
  'user-agent': STATIC_MAP_TILE_USER_AGENT,
};
