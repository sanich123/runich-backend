import type StaticMaps from 'staticmaps';
import type { LocationObject } from 'src/activity/activity.dto';

export type GeneratedActivityMap = {
  url: string;
  key?: string;
};

export type GenerateActivityMapInput = {
  userId: string;
  activityId?: string;
  locations: LocationObject[];
};

export type StaticMapTile = {
  url: string;
  box: [number, number, number, number];
};

export type StaticMapTileResult =
  | { success: true; tile: { url: string; box: StaticMapTile['box']; body: Buffer } }
  | { success: false; error: unknown };

export type StaticMapsWithTileFetcher = StaticMaps & {
  getTile: (tile: StaticMapTile) => Promise<StaticMapTileResult>;
};
