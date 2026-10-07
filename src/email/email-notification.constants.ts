export const EMAIL_NOTIFICATION_TYPE = {
  activityLike: 'activity-like',
  comment: 'comment',
  commentLike: 'comment-like',
} as const;

export type EmailNotificationType = (typeof EMAIL_NOTIFICATION_TYPE)[keyof typeof EMAIL_NOTIFICATION_TYPE];

export const EMAIL_NOTIFICATION_JOB_STATUS = {
  queued: 'queued',
  processing: 'processing',
  sent: 'sent',
  skipped: 'skipped',
  failed: 'failed',
} as const;
