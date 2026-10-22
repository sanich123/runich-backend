export const NOTIFICATION_TYPE = {
  activityLike: 'activity-like',
  comment: 'comment',
  commentLike: 'comment-like',
  moderationReportReceived: 'moderation-report-received',
  moderationReportDecision: 'moderation-report-decision',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const MANDATORY_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPE.moderationReportReceived,
  NOTIFICATION_TYPE.moderationReportDecision,
] as const;

export const PUSH_NOTIFICATION_JOB_STATUS = {
  queued: 'queued',
  processing: 'processing',
  sent: 'sent',
  skipped: 'skipped',
  failed: 'failed',
} as const;

export const NOTIFICATION_PAGE_SIZE = { default: 30, max: 50 } as const;

export const NOTIFICATION_ERROR_MESSAGE = {
  invalidPageSize: 'Некорректный размер страницы',
  invalidCursor: 'Некорректный курсор уведомлений: cursor',
  notFound: 'Уведомление не найдено',
  invalidDeviceId: 'Некорректный идентификатор устройства',
} as const;

export const PUSH_NOTIFICATION_WORKER_CONFIG = {
  maxAttempts: 5,
  staleJobAgeMs: 15 * 60 * 1000,
  maxRetryDelayMs: 60 * 60 * 1000,
  retryBaseDelayMs: 30_000,
  batchSize: 100,
} as const;

export const EXPO_PUSH_CONFIG = { url: 'https://exp.host/--/api/v2/push/send', timeoutMs: 10_000 } as const;

export const PUSH_NOTIFICATION_COPY = {
  actorFallback: 'Пользователь',
  titleTemplates: {
    activityLike: '{actor} поставил(а) лайк',
    comment: '{actor} прокомментировал(а) тренировку',
    commentLike: '{actor} оценил(а) ваш комментарий',
    generic: 'Новое уведомление',
  },
  body: {
    activityLike: 'Посмотрите, кому понравилась ваша тренировка.',
    commentLike: 'Посмотрите обсуждение тренировки.',
    generic: 'Откройте приложение, чтобы посмотреть подробности.',
  },
  interruptedJob: 'Worker перезапущен во время отправки',
  failedTicket: 'Expo Push ticket failed',
  httpErrorPrefix: 'Expo Push API вернул HTTP',
  incompleteTickets: 'Expo Push API вернул неполный список tickets',
  workerStarted: 'Worker push-уведомлений запущен: poll=',
  workerStopped: 'Worker push-уведомлений остановлен',
  workerCycleError: 'Ошибка цикла worker push-уведомлений',
  retryScheduled: 'Push notification job will retry',
  permanentFailure: 'Push notification job failed permanently',
} as const;

export const PUSH_TOKEN_DTO_DESCRIPTION = 'Expo push token for this app installation';
