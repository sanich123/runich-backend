import { jest } from '@jest/globals';
import { Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EmailService } from 'src/email/email.service';
import { asyncMock } from 'src/tests/helpers';
import { AdminFeedbackService } from '../admin-feedback.service';

describe('AdminFeedbackService', () => {
  const findMany = asyncMock();
  const findRequest = asyncMock();
  const updateRequest = asyncMock();
  const findAdmin = asyncMock();
  const createReply = asyncMock();
  const updateReply = asyncMock();
  const prisma = {
    feedbackRequest: { findMany, findUnique: findRequest, update: updateRequest },
    user: { findUnique: findAdmin },
    feedbackReply: { create: createReply, update: updateReply },
  };
  const sendFeedbackReply = asyncMock();
  const service = new AdminFeedbackService(
    prisma as unknown as PrismaService,
    { sendFeedbackReply } as unknown as EmailService,
  );
  const request = {
    id: 'feedback-1',
    kind: 'bug',
    topic: null,
    email: 'ann@example.com',
    text: 'Broken',
    deviceInfo: 'Android',
    attachments: [{ url: 'https://cdn.example/user-1/feedback/2026-09-17/feedback-1/screen.jpg' }],
    status: 'open',
    createdAt: new Date('2026-09-17T12:00:00.000Z'),
    updatedAt: '2026-09-17T12:01:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([request]);
    findRequest.mockResolvedValue({ ...request, replies: [] });
    updateRequest.mockResolvedValue({ ...request, replies: [] });
    findAdmin.mockResolvedValue({ email: 'admin@example.com' });
    createReply.mockResolvedValue({ id: 'reply-1' });
    updateReply.mockResolvedValue(undefined);
    sendFeedbackReply.mockResolvedValue(undefined);
  });

  it('normalizes list attachments and date values', async () => {
    await expect(service.list('open', 20)).resolves.toEqual([
      expect.objectContaining({
        id: 'feedback-1',
        attachments: [{ url: request.attachments[0].url, thumbnail: null }],
        createdAt: '2026-09-17T12:00:00.000Z',
        updatedAt: '2026-09-17T12:01:00.000Z',
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'open' }, orderBy: { createdAt: 'desc' }, take: 20 }),
    );

    await service.list(undefined, 10);
    expect(findMany).toHaveBeenLastCalledWith(expect.not.objectContaining({ where: expect.anything() }));
  });

  it('returns detail with chronological replies and reports missing requests', async () => {
    findRequest.mockResolvedValueOnce({
      ...request,
      replies: [
        {
          id: 'reply-1',
          text: 'Done',
          adminEmail: 'admin@example.com',
          deliveryStatus: 'sent',
          createdAt: new Date('2026-09-17T12:02:00.000Z'),
        },
      ],
    });

    await expect(service.getById('feedback-1')).resolves.toMatchObject({
      id: 'feedback-1',
      replies: [{ id: 'reply-1', createdAt: '2026-09-17T12:02:00.000Z' }],
    });
    expect(findRequest).toHaveBeenCalledWith({
      where: { id: 'feedback-1' },
      include: { replies: { orderBy: { createdAt: 'asc' } } },
    });

    findRequest.mockResolvedValueOnce(null);
    await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a request status and maps a missing row to not found', async () => {
    await service.updateStatus('feedback-1', 'resolved');
    expect(updateRequest).toHaveBeenCalledWith({ where: { id: 'feedback-1' }, data: { status: 'resolved' } });

    updateRequest.mockRejectedValueOnce({ code: 'P2025' });
    await expect(service.updateStatus('missing', 'resolved')).rejects.toBeInstanceOf(NotFoundException);

    const databaseError = new Error('Database unavailable');
    updateRequest.mockRejectedValueOnce(databaseError);
    await expect(service.updateStatus('feedback-1', 'resolved')).rejects.toBe(databaseError);
  });

  it('records a delivered reply and moves an open request into progress', async () => {
    await service.reply('feedback-1', 'admin-1', '  We fixed it  ');

    expect(createReply).toHaveBeenCalledWith({
      data: {
        requestId: 'feedback-1',
        adminUserId: 'admin-1',
        adminEmail: 'admin@example.com',
        text: 'We fixed it',
        deliveryStatus: 'pending',
      },
    });
    expect(sendFeedbackReply).toHaveBeenCalledWith('ann@example.com', 'We fixed it', request.createdAt);
    expect(updateReply).toHaveBeenCalledWith({ where: { id: 'reply-1' }, data: { deliveryStatus: 'sent' } });
    expect(updateRequest).toHaveBeenCalledWith({ where: { id: 'feedback-1' }, data: { status: 'in_progress' } });
  });

  it('does not change the status of an already active request after a successful reply', async () => {
    findRequest.mockResolvedValue({ ...request, status: 'in_progress', replies: [] });

    await service.reply('feedback-1', 'admin-1', 'Additional details');

    expect(updateReply).toHaveBeenCalledWith({ where: { id: 'reply-1' }, data: { deliveryStatus: 'sent' } });
    expect(updateRequest).not.toHaveBeenCalled();
  });

  it('rejects empty replies and missing request or admin rows', async () => {
    await expect(service.reply('feedback-1', 'admin-1', '  ')).rejects.toThrow('Текст ответа не может быть пустым');
    findRequest.mockResolvedValueOnce(null);
    await expect(service.reply('missing', 'admin-1', 'Hello')).rejects.toBeInstanceOf(NotFoundException);
    findAdmin.mockResolvedValueOnce(null);
    await expect(service.reply('feedback-1', 'missing-admin', 'Hello')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks failed email delivery and returns a service-unavailable response', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    sendFeedbackReply.mockRejectedValueOnce(new Error('SMTP unavailable'));

    await expect(service.reply('feedback-1', 'admin-1', 'Hello')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(updateReply).toHaveBeenCalledWith({ where: { id: 'reply-1' }, data: { deliveryStatus: 'failed' } });
    expect(loggerError).toHaveBeenCalled();
    loggerError.mockRestore();
  });

  it('records a non-Error delivery failure without assuming a stack', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    sendFeedbackReply.mockRejectedValueOnce('SMTP unavailable');

    await expect(service.reply('feedback-1', 'admin-1', 'Hello')).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('Не удалось отправить ответ'), 'SMTP unavailable');
    loggerError.mockRestore();
  });
});
