import type { FeedbackDto } from '../email.dto';

type FeedbackAttachmentFixture = NonNullable<FeedbackDto['attachments']>[number];

export function makeFeedbackInput(overrides: Partial<FeedbackDto> = {}): FeedbackDto {
  return {
    feedbackId: 'feedback-1',
    kind: 'bug',
    text: 'Broken',
    deviceInfo: 'Android',
    ...overrides,
  };
}

export function makeFeedbackAttachment(overrides: Partial<FeedbackAttachmentFixture> = {}) {
  return { url: 'https://cdn.example/screen.jpg', ...overrides };
}
