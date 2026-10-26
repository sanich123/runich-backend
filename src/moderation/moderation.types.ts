export type ReportLanguage = 'russian' | 'english';
export type ContentReportTargetType = 'activity' | 'comment' | 'media' | 'user' | 'media_upload';
export type ContentReportReason =
  'threats' | 'harassment' | 'hate_speech' | 'sexual_content' | 'violence' | 'spam' | 'other';
export type ContentReportStatus = 'open' | 'in_review' | 'resolved' | 'rejected' | 'appealed';
export type ModerationActionType =
  | 'hide_content'
  | 'remove_content'
  | 'restore_content'
  | 'warn_user'
  | 'temporary_suspend'
  | 'permanent_suspend'
  | 'reject_report'
  | 'appeal_submitted'
  | 'appeal_upheld'
  | 'appeal_rejected'
  | 'approve_media'
  | 'reject_media';

export type ModerationTarget = {
  targetType: ContentReportTargetType;
  targetId: string;
  subjectUserId: string;
  activityId?: string;
  commentId?: string;
  mediaId?: string;
  targetUserId?: string;
};
