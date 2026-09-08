export const DEFAULT_S3_ENDPOINT = 'https://s3.twcstorage.ru';
export const DEFAULT_S3_REGION = 'ru-1';
export const MAX_DELETE_BATCH_SIZE = 1_000;

export const MEDIA_CLEANUP_STATUS = {
  queued: 'queued',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
} as const;
