export const ACTIVITY_ENRICHMENT_STATUS = {
  queued: 'queued',
  processing: 'processing',
  completed: 'completed',
} as const;

export const ACTIVITY_ENRICHMENT_CONFIG = {
  batchSize: 8,
  requestTimeoutMs: 10_000,
  workerPollIntervalMs: 10_000,
} as const;
