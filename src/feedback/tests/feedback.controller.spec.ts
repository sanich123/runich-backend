import { jest } from '@jest/globals';
import { FeedbackController } from '../feedback.controller';
import { FeedbackService } from '../feedback.service';
import { asyncMock } from 'src/tests/helpers';
import { makeFeedbackInput } from './fixtures';

describe('FeedbackController', () => {
  const service = { create: asyncMock() };
  const controller = new FeedbackController(service as unknown as FeedbackService);

  beforeEach(() => jest.clearAllMocks());

  it('forwards the authenticated user id and request body to the support service', async () => {
    const request = { user: { id: 'user-1' } } as never;
    const feedback = makeFeedbackInput();
    service.create.mockResolvedValue({ id: feedback.feedbackId });

    await expect(controller.create(feedback, request)).resolves.toEqual({ id: feedback.feedbackId });
    expect(service.create).toHaveBeenCalledWith(feedback, 'user-1');
  });

  it('allows a guest submission without an authenticated user id', async () => {
    const feedback = makeFeedbackInput({ email: 'guest@example.test' });
    service.create.mockResolvedValue({ id: feedback.feedbackId });

    await controller.create(feedback, {} as never);

    expect(service.create).toHaveBeenCalledWith(feedback, undefined);
  });
});
