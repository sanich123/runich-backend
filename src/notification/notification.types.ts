import type { NotificationType } from './notification.constants';
import type { EmailNotificationType } from 'src/email/email-notification.constants';

export interface NotificationEventInput {
  recipientUserId: string;
  actorUserId?: string | null;
  type: NotificationType;
  emailNotificationType?: EmailNotificationType;
  sourceId: string;
  targetType: string;
  targetId: string;
  relatedId?: string;
  actorName?: string | null;
  actorSurname?: string | null;
  actorProfilePhoto?: string | null;
  content?: string | null;
}

export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

export interface NotificationCursorPayload {
  createdAt?: unknown;
  id?: unknown;
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: { notificationId: string; targetType: string; targetId: string; relatedId?: string | null };
  sound: 'default';
  priority: 'high';
  channelId: 'default';
}

export interface ExpoPushTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}
