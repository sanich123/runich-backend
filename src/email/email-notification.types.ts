export interface EmailNotificationPayload {
  activityId: string;
  actorName?: string | null;
  actorSurname?: string | null;
  actorProfilePhoto?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  recipientSurname?: string | null;
  mapPhotoUrl?: string | null;
  comment?: string;
}
