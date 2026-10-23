import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { asyncMock } from 'src/tests/helpers';
import { ModerationController } from '../moderation.controller';

describe('ModerationController', () => {
  const service = {
    submitReport: asyncMock(),
    getBlockedUsers: asyncMock(),
    blockUser: asyncMock(),
    unblockUser: asyncMock(),
    getReportQueue: asyncMock(),
    getReportDetails: asyncMock(),
    applyAction: asyncMock(),
    submitAppeal: asyncMock(),
    getAppealQueue: asyncMock(),
    decideAppeal: asyncMock(),
  };
  const controller = new ModerationController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('passes authenticated user identity and requests through the user endpoints', async () => {
    const request = { user: { id: 'user-1', userId: 'authenticated-user-1' } } as never;
    service.submitReport.mockResolvedValue({ id: 'report-1' });
    service.getBlockedUsers.mockResolvedValue({ items: [] });
    service.submitAppeal.mockResolvedValue({ id: 'appeal-1' });

    await expect(controller.submitReport({ targetType: 'comment' } as never, request)).resolves.toEqual({
      id: 'report-1',
    });
    await expect(controller.getBlockedUsers(request)).resolves.toEqual({ items: [] });
    await expect(controller.blockUser({ id: 'blocked-1' } as never, request)).resolves.toBeUndefined();
    await expect(controller.unblockUser({ id: 'blocked-1' } as never, request)).resolves.toBeUndefined();
    await expect(
      controller.submitAppeal({ id: 'report-1' } as never, { reason: 'A reason' } as never, request),
    ).resolves.toEqual({ id: 'appeal-1' });

    expect(service.submitReport).toHaveBeenCalledWith('authenticated-user-1', { targetType: 'comment' });
    expect(service.blockUser).toHaveBeenCalledWith('authenticated-user-1', 'blocked-1');
    expect(service.unblockUser).toHaveBeenCalledWith('authenticated-user-1', 'blocked-1');
    expect(service.submitAppeal).toHaveBeenCalledWith('report-1', 'authenticated-user-1', 'A reason');
  });

  it('validates the report queue filter and page size before calling the service', async () => {
    service.getReportQueue.mockResolvedValue([]);
    service.getAppealQueue.mockResolvedValue([]);

    await expect(controller.getReportQueue(undefined, undefined)).resolves.toEqual([]);
    expect(service.getReportQueue).toHaveBeenLastCalledWith(undefined, 50);
    await expect(controller.getReportQueue('open', '5')).resolves.toEqual([]);
    expect(service.getReportQueue).toHaveBeenLastCalledWith('open', 5);
    await expect(controller.getAppealQueue(undefined)).resolves.toEqual([]);
    expect(service.getAppealQueue).toHaveBeenLastCalledWith(50);
    await expect(controller.getAppealQueue('10')).resolves.toEqual([]);
    expect(service.getAppealQueue).toHaveBeenLastCalledWith(10);

    await expect(controller.getReportQueue('unknown', '5')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getReportQueue('open', '0')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getAppealQueue('101')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.getReportQueue).toHaveBeenCalledTimes(2);
    expect(service.getAppealQueue).toHaveBeenCalledTimes(2);
  });

  it('passes report review and appeal decisions to the moderation service', async () => {
    const request = { user: { id: 'moderator-1' } } as never;
    service.getReportDetails.mockResolvedValue({ report: { id: 'report-1' } });
    service.applyAction.mockResolvedValue({ id: 'report-1', status: 'resolved' });
    service.decideAppeal.mockResolvedValue({ id: 'appeal-1', status: 'upheld' });

    await expect(controller.getReportDetails({ id: 'report-1' } as never)).resolves.toEqual({
      report: { id: 'report-1' },
    });
    await expect(
      controller.applyAction({ id: 'report-1' } as never, { action: 'hide_content' } as never, request),
    ).resolves.toEqual({ id: 'report-1', status: 'resolved' });
    await expect(
      controller.decideAppeal({ id: 'appeal-1' } as never, { decision: 'upheld' } as never, request),
    ).resolves.toEqual({ id: 'appeal-1', status: 'upheld' });

    expect(service.applyAction).toHaveBeenCalledWith('report-1', 'moderator-1', { action: 'hide_content' });
    expect(service.decideAppeal).toHaveBeenCalledWith('appeal-1', 'moderator-1', { decision: 'upheld' });
  });
});
