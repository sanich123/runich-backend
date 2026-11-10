export interface GroupJoinRequestEmailPayload {
  groupId: string;
  groupName: string;
  requesterName: string;
  recipientEmail: string;
  recipientName?: string | null;
  locale: 'russian' | 'english';
}

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
