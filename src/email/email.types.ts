export type NewFeedbackEmailData = {
  id: string;
  kind: string;
  topic: string | null;
  email: string;
  text: string;
  deviceInfo: string;
  attachments: Array<{ url: string; thumbnail?: string | null }>;
};
