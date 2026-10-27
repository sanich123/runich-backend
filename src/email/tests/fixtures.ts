import type { FeedbackDto } from '../email.dto';

export function makeFeedbackInput(overrides: Partial<FeedbackDto> = {}): FeedbackDto {
  return {
    feedbackId: 'feedback-1',
    kind: 'bug',
    text: 'Broken',
    deviceInfo: 'Android',
    ...overrides,
  };
}
