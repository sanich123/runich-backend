import type { ContentReportReason, ContentReportStatus, ContentReportTargetType } from '../shared/moderation.types';

export type ReportQueueRow = {
  id: string;
  reporterId: string | null;
  targetType: ContentReportTargetType;
  targetId: string;
  subjectUserId: string | null;
  reason: ContentReportReason;
  details: string | null;
  status: ContentReportStatus;
  priority: string;
  assignedModeratorId: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  activity: { title: string | null; description: string | null } | null;
  comment: { comment: string | null } | null;
  groupPost: { text: string | null } | null;
};
