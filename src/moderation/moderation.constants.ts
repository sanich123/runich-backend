export const CONTENT_REPORT_TARGET_TYPES = ['activity', 'comment', 'media', 'user'] as const;
export const MODERATION_TARGET_TYPES = [...CONTENT_REPORT_TARGET_TYPES, 'media_upload'] as const;
export const CONTENT_REPORT_REASONS = [
  'threats',
  'harassment',
  'hate_speech',
  'sexual_content',
  'violence',
  'spam',
  'other',
] as const;
export const CONTENT_REPORT_STATUSES = ['open', 'in_review', 'resolved', 'rejected', 'appealed'] as const;
export const MODERATION_ACTION_TYPES = [
  'hide_content',
  'remove_content',
  'restore_content',
  'warn_user',
  'temporary_suspend',
  'permanent_suspend',
  'reject_report',
  'appeal_submitted',
  'appeal_upheld',
  'appeal_rejected',
  'approve_media',
  'reject_media',
] as const;

export type ContentReportTargetType = (typeof MODERATION_TARGET_TYPES)[number];
export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number];
export type ContentReportStatus = (typeof CONTENT_REPORT_STATUSES)[number];
export type ModerationActionType = (typeof MODERATION_ACTION_TYPES)[number];
