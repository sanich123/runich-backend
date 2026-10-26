import type {
  ContentReportReason,
  ContentReportStatus,
  ContentReportTargetType,
  ModerationActionType,
  ReportLanguage,
} from './moderation.types';

export const CONTENT_REPORT_TARGET_TYPES = [
  'activity',
  'comment',
  'media',
  'user',
] as const satisfies readonly ContentReportTargetType[];
export const MODERATION_TARGET_TYPES = [
  ...CONTENT_REPORT_TARGET_TYPES,
  'media_upload',
] as const satisfies readonly ContentReportTargetType[];
export const CONTENT_REPORT_REASONS = [
  'threats',
  'harassment',
  'hate_speech',
  'sexual_content',
  'violence',
  'spam',
  'other',
] as const satisfies readonly ContentReportReason[];
export const CONTENT_REPORT_STATUSES = [
  'open',
  'in_review',
  'resolved',
  'rejected',
  'appealed',
] as const satisfies readonly ContentReportStatus[];
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
] as const satisfies readonly ModerationActionType[];

export const OPEN_REPORT_STATUSES: ContentReportStatus[] = ['open', 'in_review'];
export const ACTIVE_QUEUE_STATUSES: ContentReportStatus[] = ['open', 'in_review', 'appealed'];
export const MAX_BLOCKED_USERS = 500;

export const REPORT_TARGET_LABELS: Record<ReportLanguage, Record<string, string>> = {
  russian: { activity: 'тренировка', comment: 'комментарий', media: 'фото или видео', user: 'профиль' },
  english: { activity: 'activity', comment: 'comment', media: 'photo or video', user: 'profile' },
};

export const REPORT_REASON_LABELS: Record<ReportLanguage, Record<string, string>> = {
  russian: {
    threats: 'угрозы',
    harassment: 'преследование',
    hate_speech: 'язык ненависти',
    sexual_content: 'сексуальный контент',
    violence: 'насилие',
    spam: 'спам',
    other: 'другое',
  },
  english: {
    threats: 'threats',
    harassment: 'harassment',
    hate_speech: 'hate speech',
    sexual_content: 'sexual content',
    violence: 'violence',
    spam: 'spam',
    other: 'other',
  },
};
