import type { ModerationActionType } from './moderation.types';
import { REPORT_REASON_LABELS, REPORT_TARGET_LABELS } from './moderation.constants';

export function createReportReceiptCopy(report: { id: string; targetType: string; reason: string }) {
  const shortId = report.id.slice(0, 8);
  return {
    russian: `Жалоба №${shortId} на ${REPORT_TARGET_LABELS.russian[report.targetType] ?? report.targetType} (${REPORT_REASON_LABELS.russian[report.reason] ?? report.reason}) принята к рассмотрению. Модератор проверит материалы; обычно решение принимается в течение 7 календарных дней. В сложных случаях срок может увеличиться. О результате сообщим здесь и по электронной почте.`,
    english: `Report ${shortId} about ${REPORT_TARGET_LABELS.english[report.targetType] ?? report.targetType} (${REPORT_REASON_LABELS.english[report.reason] ?? report.reason}) was received. A moderator will review it; decisions usually take up to 7 calendar days. Complex cases may take longer. We will notify you here and by email.`,
  };
}

export function createReportDecisionCopy(report: { id: string; targetType: string }, action: ModerationActionType) {
  const shortId = report.id.slice(0, 8);
  if (action === 'reject_report') {
    return {
      russian: `Жалоба №${shortId} рассмотрена: нарушение не подтверждено. Если появятся новые факты, отправьте новую жалобу с дополнительными сведениями.`,
      english: `Report ${shortId} has been reviewed; we could not confirm a violation. If you have new evidence, submit a new report with the added details.`,
    };
  }
  if (action === 'restore_content') {
    return {
      russian: `Жалоба №${shortId} рассмотрена: материал проверен и оставлен доступным. Если появятся новые факты, отправьте новую жалобу с дополнительными сведениями.`,
      english: `Report ${shortId} has been reviewed; the content remains available. If you have new evidence, submit a new report with the added details.`,
    };
  }
  return {
    russian: `Жалоба №${shortId} рассмотрена: нарушение подтверждено, меры приняты к контенту или аккаунту. Подробности санкций конфиденциальны. Если нарушение продолжается, отправьте новую жалобу с актуальными сведениями.`,
    english: `Report ${shortId} has been reviewed: a violation was confirmed and action was taken on the content or account. Sanction details are private. If the issue continues, submit a new report with current details.`,
  };
}
