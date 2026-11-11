import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EmailNotificationService } from './email-notification.service';

export async function resolveModerationReportNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const report = await prisma.contentReport.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      targetId: true,
      targetType: true,
      reason: true,
      details: true,
      reporterId: true,
      subjectUserId: true,
      reporter: { select: { id: true, email: true, profile: { select: { name: true, surname: true } } } },
      subjectUser: {
        select: {
          id: true,
          email: true,
          profile: { select: { name: true, surname: true, bio: true, profilePhoto: true } },
        },
      },
      activity: { select: { title: true, description: true } },
      comment: { select: { comment: true } },
      media: { select: { url: true, thumbnail: true, mediaReviewStatus: true } },
      mediaUpload: {
        select: {
          owner: {
            select: {
              id: true,
              email: true,
              profile: { select: { name: true, surname: true, bio: true, profilePhoto: true } },
            },
          },
        },
      },
    },
  });
  if (!report) return null;
  const reportedContent =
    report.targetType === 'activity'
      ? [report.activity?.title, report.activity?.description].filter(Boolean).join('\n') || null
      : report.targetType === 'comment'
        ? (report.comment?.comment ?? null)
        : report.targetType === 'user'
          ? (report.subjectUser?.profile?.bio ?? null)
          : null;
  const contentAuthor = report.subjectUser ?? report.mediaUpload?.owner;
  const payload = {
    reportId: report.id,
    requestType: 'report' as const,
    targetType: report.targetType,
    targetId: report.targetId,
    reason: report.reason,
    reporterDetails: report.details,
    reporter: report.reporter
      ? {
          id: report.reporter.id,
          email: report.reporter.email,
          name: report.reporter.profile?.name,
          surname: report.reporter.profile?.surname,
        }
      : report.reporterId
        ? { id: report.reporterId }
        : null,
    reportedUser: contentAuthor
      ? {
          id: contentAuthor.id,
          email: contentAuthor.email,
          name: contentAuthor.profile?.name,
          surname: contentAuthor.profile?.surname,
        }
      : report.subjectUserId
        ? { id: report.subjectUserId }
        : null,
    reportedContent,
    reportedMediaUrl:
      report.media?.mediaReviewStatus === 'rejected' ? null : (report.media?.thumbnail ?? report.media?.url ?? null),
    reportedProfile: report.targetType === 'user' ? (report.subjectUser?.profile ?? null) : null,
  };
  return { send: () => notifications.sendModerationUpdate(payload) };
}

export async function resolveReporterReceiptNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const report = await prisma.contentReport.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      targetType: true,
      reason: true,
      reporter: {
        select: {
          profile: { select: { language: true } },
        },
      },
    },
  });
  const reporter = report?.reporter;
  if (!report || !reporter) return null;
  const locale: 'russian' | 'english' = reporter.profile?.language === 'russian' ? 'russian' : 'english';
  const payload = {
    reportId: report.id,
    targetType: report.targetType,
    reason: report.reason,
    requestType: 'received' as const,
    locale,
  };
  return { send: () => notifications.sendReporterModerationUpdate(payload) };
}

export async function resolveReporterDecisionNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const action = await prisma.moderationAction.findUnique({
    where: { id: sourceId },
    select: {
      action: true,
      report: {
        select: {
          id: true,
          targetType: true,
          reason: true,
          reporter: {
            select: {
              profile: { select: { language: true } },
            },
          },
        },
      },
    },
  });
  const report = action?.report;
  const reporter = report?.reporter;
  if (!action || !report || !reporter) return null;
  const locale: 'russian' | 'english' = reporter.profile?.language === 'russian' ? 'russian' : 'english';
  const payload = {
    reportId: report.id,
    targetType: report.targetType,
    reason: report.reason,
    requestType: 'decision' as const,
    locale,
    outcome:
      action.action === 'reject_report'
        ? ('not-confirmed' as const)
        : action.action === 'restore_content'
          ? ('content-restored' as const)
          : ('confirmed' as const),
  };
  return { send: () => notifications.sendReporterModerationUpdate(payload) };
}

export async function resolveModerationAppealNotification(
  prisma: PrismaService,
  notifications: EmailNotificationService,
  sourceId: string,
) {
  const appeal = await prisma.moderationAppeal.findUnique({
    where: { id: sourceId },
    select: { report: { select: { id: true, targetType: true } } },
  });
  if (!appeal) return null;
  const payload = {
    reportId: appeal.report.id,
    appealId: sourceId,
    requestType: 'appeal' as const,
    targetType: appeal.report.targetType,
    reason: 'appeal',
  };
  return { send: () => notifications.sendModerationUpdate(payload) };
}
