import { jest } from '@jest/globals';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { asyncMock } from 'src/tests/helpers';
import { ModerationController } from '../moderation.controller';
import { createModerationEmailActionToken } from '../moderation-email-action-token.utils';

describe('ModerationController', () => {
  const service = {
    submitReport: asyncMock(),
    getBlockedUsers: asyncMock(),
    blockUser: asyncMock(),
    unblockUser: asyncMock(),
    getReportQueue: asyncMock(),
    deleteReport: asyncMock(),
    getReportDetails: asyncMock(),
    applyAction: asyncMock(),
    validateEmailModerationAction: asyncMock(),
    applyEmailModerationAction: asyncMock(),
    submitAppeal: asyncMock(),
    getAppealQueue: asyncMock(),
    decideAppeal: asyncMock(),
  };
  const controller = new ModerationController(service as never);

  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-email-action-secret';
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it('shows a read-only confirmation page for a valid email action token', async () => {
    const token = createModerationEmailActionToken('report-1', 'hide_content');
    service.validateEmailModerationAction.mockResolvedValue('comment');

    const page = await controller.confirmEmailAction(token);

    expect(page).toContain('Подтвердить действие модерации');
    expect(page).toContain('комментарий');
    expect(page).toContain('method="post"');
    expect(service.validateEmailModerationAction).toHaveBeenCalledWith('report-1', 'hide_content');
    expect(service.applyEmailModerationAction).not.toHaveBeenCalled();
  });

  it('applies the action only after the confirmation form is submitted', async () => {
    const token = createModerationEmailActionToken('report-2', 'warn_user');
    service.applyEmailModerationAction.mockResolvedValue({ id: 'report-2', status: 'resolved' });

    const page = await controller.applyEmailAction(token);

    expect(page).toContain('Действие');
    expect(page).toContain('Жалоба закрыта');
    expect(service.applyEmailModerationAction).toHaveBeenCalledWith('report-2', 'warn_user');
  });

  it('returns generic pages for invalid tokens and actions that became unavailable', async () => {
    const validToken = createModerationEmailActionToken('report-3', 'remove_content');
    service.validateEmailModerationAction.mockRejectedValue(new ConflictException());

    await expect(controller.confirmEmailAction('invalid')).resolves.toContain('Ссылка недействительна');
    await expect(controller.confirmEmailAction(validToken)).resolves.toContain('состояние контента изменилось');
    await expect(controller.applyEmailAction('invalid')).resolves.toContain('Ссылка недействительна');
    expect(service.applyEmailModerationAction).not.toHaveBeenCalled();
  });

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

  it('deletes the selected report through the moderation service', async () => {
    service.deleteReport.mockResolvedValue(undefined);

    await expect(controller.deleteReport({ id: 'report-1' } as never)).resolves.toBeUndefined();
    expect(service.deleteReport).toHaveBeenCalledWith('report-1');
  });
});
