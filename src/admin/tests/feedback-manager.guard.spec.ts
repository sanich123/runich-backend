import { jest } from '@jest/globals';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { asyncMock } from 'src/tests/helpers';
import { AdminAccessService } from '../admin-access.service';
import { FeedbackManagerGuard } from '../feedback-manager.guard';

describe('FeedbackManagerGuard', () => {
  const hasPermission = asyncMock();
  const guard = new FeedbackManagerGuard({ hasPermission } as unknown as AdminAccessService);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'admin-1' } }) }),
  } as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('allows administrators with the feedback permission', async () => {
    hasPermission.mockResolvedValue(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermission).toHaveBeenCalledWith('admin-1', 'feedback.manage');
  });

  it('rejects administrators without the feedback permission', async () => {
    hasPermission.mockResolvedValue(false);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
