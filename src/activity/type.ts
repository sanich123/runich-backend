import type { ActivityDto, ActivityHeartRateSampleObject } from './activity.dto';
import type { ActivityCursor } from './activity.pagination';

export type EnqueueMigrationInput = {
  userId: string;
  profileId: string;
  archivePath: string;
};

export type StartMigrationUploadInput = {
  userId: string;
  profileId: string;
  uploadBytesTotal: number;
};

export type MigrationJob = {
  id: string;
  userId: string;
  profileId: string;
  archivePath: string | null;
  status: string;
  uploadBytesReceived: number;
  uploadBytesTotal: number;
  uploadUpdatedAt: Date | null;
  totalActivities: number;
  processedActivities: number;
  importedActivities: number;
  skippedActivities: number;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type MigratedActivity = ActivityDto & {
  id: string;
  userId: string;
  profileId: string;
  source: 'strava';
  sourceActivityId: string;
  /** Elevation gain calculated by Strava and stored in activities.csv. */
  sourceElevationGain?: number;
  heartRateSamples?: ActivityHeartRateSampleObject[];
  averageHeartRate?: number | null;
  minHeartRate?: number | null;
  maxHeartRate?: number | null;
};

export type MigrationProgress = Pick<MigrationJob, 'processedActivities' | 'importedActivities' | 'skippedActivities'>;

export type ActivityFeedSqlRow = ActivityCursor & Record<string, unknown>;

export type ActivityMediaProcessingRecord = {
  id: string;
  media: Array<{
    position: number;
    url: string;
    thumbnail: string | null;
    blurhash: string | null;
  }>;
  mapPhotoUrl: string | null;
  mapPhotoUrlBlurhash: string | null;
};
