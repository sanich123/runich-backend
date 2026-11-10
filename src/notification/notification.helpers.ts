import { PUSH_NOTIFICATION_COPY } from './notification.constants';

export function getNotificationActorName(name?: string | null, surname?: string | null) {
  return [name, surname].filter(Boolean).join(' ') || PUSH_NOTIFICATION_COPY.actorFallback;
}

export function getPushNotificationTitle(type: string, actorName: string) {
  const templates = PUSH_NOTIFICATION_COPY.titleTemplates;
  const templatesByType: Record<string, string> = {
    'activity-like': templates.activityLike,
    comment: templates.comment,
    'comment-like': templates.commentLike,
    'group-post': templates.groupPost,
    'group-event': templates.groupEvent,
  };
  const title = templatesByType[type] ?? templates.generic;
  return title.replace('{actor}', actorName);
}

export function getPushNotificationBody(type: string, content: string | null) {
  if (content) return content.slice(0, 180);
  if (type === 'activity-like') return PUSH_NOTIFICATION_COPY.body.activityLike;
  if (type === 'comment-like') return PUSH_NOTIFICATION_COPY.body.commentLike;
  return PUSH_NOTIFICATION_COPY.body.generic;
}

export function getNotificationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
