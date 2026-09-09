export const ACTIVITY_MEDIA_PROCESSING_STATUS = {
  queued: 'queued',
  processing: 'processing',
  completed: 'completed',
} as const;

export const ACTIVITY_MEDIA_PROCESSING_CONFIG = {
  batchSize: 8,
  workerPollIntervalMs: 10_000,
} as const;
