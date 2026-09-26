export const ACTIVITY_MIGRATION_CONFIG = {
  archiveDirectory: './dist/receivedArchive',
  batchSize: 8,
  batchPauseMs: 25,
  workerPollIntervalMs: 10_000,
  uploadProgressIntervalMs: 500,
  uploadStaleAfterMs: 30 * 60 * 1000,
} as const;
