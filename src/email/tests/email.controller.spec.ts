import { jest } from '@jest/globals';
import { EmailController } from '../email.controller';
import { EmailService } from '../email.service';
import { asyncMock } from 'src/tests/helpers';

const baseEmail = {
  name: 'Ann',
  surname: 'Runner',
  profilePhoto: 'https://example.com/profile.jpg',
  activityId: 'a1',
  recepientName: 'Bob',
  recepientSurname: 'Runner',
  recepientEmail: 'bob@example.com',
};

describe('EmailController', () => {
  const service = {
    sendLikeEmailNotification: asyncMock(),
    sendCommentEmailNotification: asyncMock(),
    sendCommentLikeEmailNotification: asyncMock(),
    sendFeedback: asyncMock(),
  };
  const controller = new EmailController(service as unknown as EmailService);

  beforeEach(() => jest.clearAllMocks());

  it('returns service results for every email endpoint', async () => {
    service.sendLikeEmailNotification.mockResolvedValue(undefined);
    service.sendCommentEmailNotification.mockResolvedValue(undefined);
    service.sendCommentLikeEmailNotification.mockResolvedValue(undefined);

    await expect(controller.sendLikeEmailNotification({ ...baseEmail, mapPhotoUrl: 'map' })).resolves.toBeUndefined();
    await expect(
      controller.sendCommentEmailNotification({ ...baseEmail, comment: 'Comment', mapPhotoUrl: 'map' }),
    ).resolves.toBeUndefined();
    await expect(
      controller.sendCommentLikeEmailNotification({ ...baseEmail, comment: 'Comment' }),
    ).resolves.toBeUndefined();
  });

  it('propagates service errors from every email endpoint', async () => {
    const error = new Error('mail failed');
    Object.values(service).forEach((method) => method.mockRejectedValue(error));

    await expect(controller.sendLikeEmailNotification({ ...baseEmail, mapPhotoUrl: 'map' })).rejects.toBe(error);
    await expect(
      controller.sendCommentEmailNotification({ ...baseEmail, comment: 'Comment', mapPhotoUrl: 'map' }),
    ).rejects.toBe(error);
    await expect(controller.sendCommentLikeEmailNotification({ ...baseEmail, comment: 'Comment' })).rejects.toBe(error);
  });

  it('takes the feedback author from the authenticated request and forwards the optional photo', async () => {
    const request = { user: { id: 'user-1' } } as never;
    const photo = { originalname: 'screen.jpg' } as Express.Multer.File;
    service.sendFeedback.mockResolvedValue(undefined);

    await expect(
      controller.sendFeedback({ kind: 'bug', text: 'Broken', deviceInfo: 'Android' }, request, photo),
    ).resolves.toBeUndefined();

    expect(service.sendFeedback).toHaveBeenCalledWith('bug', 'user-1', 'Broken', 'Android', photo);
  });
});
