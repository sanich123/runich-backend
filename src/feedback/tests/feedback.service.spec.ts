import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { EmailService } from 'src/email/email.service';
import { asyncMock } from 'src/tests/helpers';
import { FeedbackService } from '../feedback.service';
import { makeFeedbackAttachment, makeFeedbackInput } from './fixtures';

describe('FeedbackService', () => {
  const findUser = asyncMock();
  const findRequest = asyncMock();
  const createRequest = asyncMock();
  const updateRequest = asyncMock();
  const prisma = {
    user: { findUnique: findUser },
    feedbackRequest: { findUnique: findRequest, create: createRequest, update: updateRequest },
  };
  const getFeedbackAttachmentKey = jest.fn();
  const emailService = {
    sendNewFeedbackNotification: asyncMock(),
    sendFeedbackReceipt: asyncMock(),
  };
  const service = new FeedbackService(
    prisma as unknown as PrismaService,
    { getFeedbackAttachmentKey } as unknown as StorageService,
    emailService as unknown as EmailService,
  );
  const createdRequest = {
    id: 'feedback-1',
    email: 'ann@example.com',
    senderUserId: 'user-1',
    kind: 'bug',
    topic: null,
    text: 'Broken',
    deviceInfo: 'Android',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findUser.mockResolvedValue({ email: ' Ann@Example.com ' });
    findRequest.mockResolvedValue(null);
    createRequest.mockResolvedValue(createdRequest);
    updateRequest.mockResolvedValue(createdRequest);
    getFeedbackAttachmentKey.mockReturnValue('user-1/feedback/2026-09-17/feedback-1/screen.jpg');
    emailService.sendNewFeedbackNotification.mockResolvedValue(undefined);
    emailService.sendFeedbackReceipt.mockResolvedValue(undefined);
  });

  it('normalizes an authenticated user email and persists a trimmed request', async () => {
    const feedback = makeFeedbackInput({ text: ' Broken ', deviceInfo: ' Android ' });

    await expect(service.create(feedback, 'user-1')).resolves.toEqual({
      id: 'feedback-1',
      email: 'ann@example.com',
      confirmationEmailSent: true,
    });

    expect(createRequest).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'feedback-1',
        senderUserId: 'user-1',
        email: 'ann@example.com',
        text: 'Broken',
        deviceInfo: 'Android',
      }),
    });
    expect(emailService.sendNewFeedbackNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'feedback-1', email: 'ann@example.com', text: 'Broken' }),
    );
    expect(emailService.sendFeedbackReceipt).toHaveBeenCalledWith('ann@example.com', 'feedback-1');
  });

  it('accepts and normalizes a guest email', async () => {
    const feedback = makeFeedbackInput({ email: ' Guest@Example.com ' });

    await service.create(feedback);

    expect(createRequest).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'guest@example.com', senderUserId: undefined }),
    });
    expect(findUser).not.toHaveBeenCalled();
  });

  it('returns the existing request for a retry from the same sender', async () => {
    findRequest.mockResolvedValue({ ...createdRequest, confirmationEmailSent: true });

    await expect(service.create(makeFeedbackInput(), 'user-1')).resolves.toEqual({
      id: 'feedback-1',
      email: 'ann@example.com',
      confirmationEmailSent: true,
    });
    expect(createRequest).not.toHaveBeenCalled();
    expect(emailService.sendNewFeedbackNotification).not.toHaveBeenCalled();
  });

  it('rejects a feedback id reused by a different sender', async () => {
    findRequest.mockResolvedValue({ ...createdRequest, email: 'other@example.com' });

    await expect(service.create(makeFeedbackInput(), 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('rejects a feedback id reused by a different authenticated user with the same email', async () => {
    findUser.mockResolvedValue({ email: 'ann@example.com' });
    findRequest.mockResolvedValue({ ...createdRequest, senderUserId: 'other-user' });

    await expect(service.create(makeFeedbackInput(), 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('requires valid text, device details, and an email for guests', async () => {
    await expect(service.create(makeFeedbackInput({ text: '  ' }), 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create(makeFeedbackInput({ deviceInfo: '  ' }), 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create(makeFeedbackInput())).rejects.toBeInstanceOf(BadRequestException);
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('rejects missing users and attachments outside their feedback folder', async () => {
    findUser.mockResolvedValueOnce(null);
    await expect(service.create(makeFeedbackInput(), 'deleted-user')).rejects.toBeInstanceOf(NotFoundException);

    getFeedbackAttachmentKey.mockImplementationOnce(() => {
      throw new BadRequestException('Вложение feedback имеет некорректный S3-путь');
    });
    await expect(
      service.create(
        makeFeedbackInput({
          attachments: [makeFeedbackAttachment()],
        }),
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('validates both the attachment and thumbnail before persisting a request', async () => {
    const attachment = makeFeedbackAttachment({ thumbnail: 'https://cdn.example/thumb.jpg' });

    await service.create(makeFeedbackInput({ attachments: [attachment] }), 'user-1');

    expect(getFeedbackAttachmentKey).toHaveBeenNthCalledWith(1, 'user-1', 'feedback-1', attachment.url);
    expect(getFeedbackAttachmentKey).toHaveBeenNthCalledWith(2, 'user-1', 'feedback-1', attachment.thumbnail);
    expect(createRequest).toHaveBeenCalledWith({
      data: expect.objectContaining({ attachments: [attachment] }),
    });
  });

  it('keeps a request when either notification email fails and records delivery state', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    emailService.sendNewFeedbackNotification.mockRejectedValueOnce(new Error('support mailbox unavailable'));
    emailService.sendFeedbackReceipt.mockRejectedValueOnce(new Error('user mailbox unavailable'));

    await expect(service.create(makeFeedbackInput({ email: 'ann@example.com' }))).resolves.toMatchObject({
      id: 'feedback-1',
      confirmationEmailSent: false,
    });

    expect(updateRequest).toHaveBeenCalledWith({
      where: { id: 'feedback-1' },
      data: { adminNotificationSent: false, confirmationEmailSent: false },
    });
    expect(loggerError).toHaveBeenCalledTimes(2);
    loggerError.mockRestore();
  });
});
