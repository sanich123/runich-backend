import type { ActivityDto, ActivityHeartRateSampleObject } from '../dto/activity.dto';
import type { ActivityCursor } from './activity.pagination';
import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

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
    url: string | null;
    thumbnail: string | null;
    blurhash: string | null;
  }>;
  mapPhotoUrl: string | null;
  mapPhotoUrlBlurhash: string | null;
};

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

export type ActivityEnrichmentRecord = {
  id: string;
  routeStorageKey: string | null;
  kilometresSplit: unknown;
  date: Date;
  timeZone: string | null;
};

export type WeatherResponse = {
  hourly?: {
    time?: unknown[];
    temperature_2m?: unknown[];
    wind_speed_10m?: unknown[];
    weather_code?: unknown[];
  };
};

export type Coordinate = { latitude: number; longitude: number };

export type ActivityUpdateField =
  | 'date'
  | 'timeZone'
  | 'description'
  | 'distance'
  | 'elevationGain'
  | 'duration'
  | 'speed'
  | 'sport'
  | 'title'
  | 'kilometresSplit'
  | 'heartRateStorageKey'
  | 'averageHeartRate'
  | 'minHeartRate'
  | 'maxHeartRate'
  | 'mapPhotoUrl'
  | 'routeOnlyMapPhotoUrl'
  | 'routeStorageKey'
  | 'routeFormatVersion'
  | 'routePointCount'
  | 'routeSizeBytes'
  | 'routeChecksum'
  | 'mapPhotoUrlBlurhash'
  | 'hideMap'
  | 'mediaProcessingStatus'
  | 'locationName'
  | 'weatherTemperature'
  | 'weatherWindSpeed'
  | 'weatherCode'
  | 'locationEnrichmentStatus'
  | 'caloriesActive';

export type ActivityDatabase = Pick<PrismaService, 'activity' | 'activityMedia' | 'mediaCleanupJob'>;

export type ActivityCaloriesInput = {
  weight?: string | number | null;
  height?: string | number | null;
  age?: string | number | null;
  gender?: string | null;
  sport: string;
  distance: number;
  duration: number;
};

export type ActivityTitleGender = 'masculine' | 'feminine' | 'neuter';

export type ActivityName = {
  name: string;
  gender: ActivityTitleGender;
};

export type TimeOfDay = {
  untilHour: number;
  adjectives: Record<ActivityTitleGender, string>;
};
