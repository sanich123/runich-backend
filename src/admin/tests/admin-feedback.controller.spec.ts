import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { asyncMock } from 'src/tests/helpers';
import { AdminFeedbackController } from '../admin-feedback.controller';
import { AdminFeedbackService } from '../admin-feedback.service';

describe('AdminFeedbackController', () => {
  const service = { list: asyncMock(), getById: asyncMock(), updateStatus: asyncMock(), reply: asyncMock() };
  const controller = new AdminFeedbackController(service as unknown as AdminFeedbackService);
  const request = { user: { id: 'admin-1' } } as never;
  const params = { id: 'feedback-1' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('validates filters and list size before querying the queue', async () => {
    service.list.mockResolvedValue([]);

    await expect(controller.list()).resolves.toEqual([]);
    await controller.list('resolved', '10');
    expect(service.list).toHaveBeenNthCalledWith(1, undefined, 50);
    expect(service.list).toHaveBeenNthCalledWith(2, 'resolved', 10);
    await expect(controller.list('invalid')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.list(undefined, '101')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('forwards detail, status, and reply operations', async () => {
    service.getById.mockResolvedValue({ id: 'feedback-1' });
    service.updateStatus.mockResolvedValue({ id: 'feedback-1', status: 'resolved' });
    service.reply.mockResolvedValue({ id: 'feedback-1' });

    await expect(controller.getById(params)).resolves.toEqual({ id: 'feedback-1' });
    await expect(controller.updateStatus(params, { status: 'resolved' })).resolves.toMatchObject({
      status: 'resolved',
    });
    await expect(controller.reply(params, { text: ' Reply ' }, request)).resolves.toEqual({ id: 'feedback-1' });
    expect(service.getById).toHaveBeenCalledWith('feedback-1');
    expect(service.updateStatus).toHaveBeenCalledWith('feedback-1', 'resolved');
    expect(service.reply).toHaveBeenCalledWith('feedback-1', 'admin-1', ' Reply ');
  });
});
