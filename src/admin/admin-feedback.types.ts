export type AdminFeedbackRequestRow = {
  id: string;
  kind: string;
  topic: string | null;
  email: string;
  text: string;
  deviceInfo: string;
  attachments: unknown;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type AdminFeedbackReplyRow = {
  id: string;
  text: string;
  adminEmail: string;
  deliveryStatus: string;
  createdAt: Date | string;
};

export type AdminFeedbackDetailRow = AdminFeedbackRequestRow & {
  replies: AdminFeedbackReplyRow[];
};
