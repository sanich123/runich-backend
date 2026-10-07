import { jest } from '@jest/globals';
import { EmailController } from '../email.controller';
import { EmailService } from '../email.service';
import { asyncMock } from 'src/tests/helpers';

describe('EmailController', () => {
  const service = {
    sendFeedback: asyncMock(),
  };
  const controller = new EmailController(service as unknown as EmailService);

  beforeEach(() => jest.clearAllMocks());

  it('takes the feedback author from the authenticated request and forwards S3 feedback media', async () => {
    const request = { user: { id: 'user-1' } } as never;
    const feedback = { feedbackId: 'feedback-1', kind: 'bug', text: 'Broken', deviceInfo: 'Android' };
    service.sendFeedback.mockResolvedValue(undefined);

    await expect(controller.sendFeedback(feedback, request)).resolves.toBeUndefined();

    expect(service.sendFeedback).toHaveBeenCalledWith(feedback, 'user-1');
  });
});
