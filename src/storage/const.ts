export const DEFAULT_S3_ENDPOINT = 'https://s3.twcstorage.ru';
export const DEFAULT_S3_REGION = 'ru-1';
export const MAX_DELETE_BATCH_SIZE = 1_000;
export const MEDIA_BATCH_CONCURRENCY = 3;
export const ACTIVITY_ROUTE_CACHE_TTL_MS = 5 * 60_000;
export const ACTIVITY_ROUTE_CACHE_MAX_ENTRIES = 64;
export const SUPPORTED_VIDEO_EXTENSIONS = new Set(['mov', 'mp4', 'webm']);
export const SUPPORTED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

export function isSupportedVideoUpload(originalName: string, mimetype: string) {
  if (!SUPPORTED_VIDEO_MIME_TYPES.has(mimetype)) return false;

  const extension = originalName.match(/\.([^.]+)$/)?.[1].toLowerCase();
  return !extension || SUPPORTED_VIDEO_EXTENSIONS.has(extension);
}

export const MEDIA_CLEANUP_STATUS = {
  queued: 'queued',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
} as const;
