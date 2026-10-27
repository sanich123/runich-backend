import type { SubmitContentReportDto } from '../moderation.dto';

type ReportSubmissionFixture = {
  targetType: SubmitContentReportDto['targetType'];
  targetId: string;
  reason: SubmitContentReportDto['reason'];
};

export function makeSpamActivityReport(overrides: Partial<ReportSubmissionFixture> = {}): ReportSubmissionFixture {
  return {
    targetType: 'activity',
    targetId: 'activity-1',
    reason: 'spam',
    ...overrides,
  };
}

type ModerationReportFixture = {
  id: string;
  status: string;
  targetType: string;
  targetId: string;
  subjectUserId: string | null;
};

export function makeModerationReport(overrides: Partial<ModerationReportFixture> = {}) {
  return {
    id: 'report-1',
    status: 'open',
    targetType: 'activity',
    targetId: 'activity-1',
    subjectUserId: 'author-1',
    ...overrides,
  };
}
