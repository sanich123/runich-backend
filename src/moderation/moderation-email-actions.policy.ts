import type { ModerationEmailAction } from './moderation-email-actions.types';

const EMAIL_ACTION_LABELS: Record<ModerationEmailAction, string> = {
  hide_content: 'Скрыть контент',
  remove_content: 'Удалить контент',
  restore_content: 'Восстановить контент',
  warn_user: 'Предупредить автора',
  temporary_suspend: 'Заблокировать на 7 дней',
  permanent_suspend: 'Заблокировать навсегда',
  reject_report: 'Отклонить жалобу',
  approve_media: 'Одобрить фото или видео',
  reject_media: 'Отклонить фото или видео',
};

const TARGET_LABELS: Record<string, string> = {
  activity: 'тренировку',
  activity_text: 'текст тренировки',
  comment: 'комментарий',
  group_post: 'публикацию группы',
  media: 'фото или видео',
  media_upload: 'фото или видео',
  user: 'профиль',
  group: 'группу',
};

const USER_ACTIONS: ModerationEmailAction[] = ['warn_user', 'temporary_suspend', 'permanent_suspend', 'reject_report'];

const CONTENT_ACTIONS: ModerationEmailAction[] = [
  'hide_content',
  'remove_content',
  'restore_content',
  'warn_user',
  'temporary_suspend',
  'permanent_suspend',
  'reject_report',
];

export function getModerationEmailActionLabel(action: ModerationEmailAction) {
  return EMAIL_ACTION_LABELS[action];
}

export function getModerationEmailTargetLabel(targetType: string) {
  return TARGET_LABELS[targetType] ?? targetType;
}

export function getAvailableModerationEmailActions(
  targetType: string,
  reportStatus: string,
  moderationStatus?: string | null,
): ModerationEmailAction[] {
  if (reportStatus !== 'open' && reportStatus !== 'in_review') return [];
  if (targetType === 'media_upload') {
    return moderationStatus === 'review_required' ? ['approve_media', 'reject_media'] : [];
  }
  if (targetType === 'user') return [...USER_ACTIONS];

  return CONTENT_ACTIONS.filter((action) => {
    if (action === 'hide_content') return moderationStatus === 'visible';
    if (action === 'remove_content') return moderationStatus !== 'removed';
    if (action === 'restore_content') return Boolean(moderationStatus && moderationStatus !== 'visible');
    return true;
  });
}
