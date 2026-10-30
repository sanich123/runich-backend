import type { ActivityCursor } from '../activity.pagination';

export type ActivityRouteWorkoutFilters = {
  search?: string;
  month?: number;
  day?: number;
  year?: number;
  timeZone: string;
};

export type HomeFeedCursor = ActivityCursor | 'done' | undefined;
export type HomeFeedCursors = {
  my?: HomeFeedCursor;
  followers?: HomeFeedCursor;
  favorites?: HomeFeedCursor;
};
export type ActivityMediaWithModerationReferences = {
  url: string | null;
  thumbnail: string | null;
  mediaModerationAssetId: string | null;
  thumbnailModerationAssetId: string | null;
  [key: string]: unknown;
};
