export const S3_REGION = 'ru-1';
export const MAX_DELETE_BATCH_SIZE = 1_000;
export const MEDIA_BATCH_CONCURRENCY = 3;
export const ACTIVITY_ROUTE_CACHE_TTL_MS = 5 * 60_000;
export const ACTIVITY_ROUTE_CACHE_MAX_ENTRIES = 64;
const SUPPORTED_VIDEO_EXTENSIONS = new Set(['mov', 'mp4', 'webm']);
const SUPPORTED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

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

export const MEDIA_MODERATION_MODEL_VERSION = 'nsfwjs-five-label-cpu';
export const MEDIA_MODERATION_MAX_VIDEO_SECONDS = 60;
export const MEDIA_MODERATION_VIDEO_SAMPLE_INTERVAL_SECONDS = 5;
export const MEDIA_MODERATION_MAX_VIDEO_FRAMES = Math.ceil(
  MEDIA_MODERATION_MAX_VIDEO_SECONDS / MEDIA_MODERATION_VIDEO_SAMPLE_INTERVAL_SECONDS,
);
export const MEDIA_MODERATION_POLL_INTERVAL_MS = 2_000;
export const MEDIA_MODERATION_RETRY_LIMIT = 5;
export const MEDIA_MODERATION_STALE_PROCESSING_MS = 15 * 60_000;
export const MEDIA_MODERATION_GOOGLE_VISION_MONTHLY_LIMIT = 950;
export const MEDIA_MODERATION_GOOGLE_VISION_MODEL_PREFIX = 'google-cloud-vision-safe-search-';
export const MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION = `${MEDIA_MODERATION_GOOGLE_VISION_MODEL_PREFIX}v2`;
export const MEDIA_MODERATION_REVIEW_THRESHOLDS = {
  Porn: 0.25,
  Hentai: 0.6,
  Sexy: 0.6,
  Spoof: 0.75,
  Medical: 0.75,
  Violence: 0.75,
} as const;

export const MODEL_URL = process.env.NSFWJS_MODEL_URL?.trim();
