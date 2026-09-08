import type { ActivityDto } from './activity.dto';

export type EnqueueMigrationInput = {
  userId: string;
  profileId: string;
  archivePath: string;
};

export type MigrationJob = {
  id: string;
  userId: string;
  profileId: string;
  archivePath: string;
  status: string;
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
};

export type MigrationProgress = Pick<MigrationJob, 'processedActivities' | 'importedActivities' | 'skippedActivities'>;
