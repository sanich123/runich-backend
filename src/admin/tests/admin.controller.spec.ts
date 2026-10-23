import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { asyncMock } from 'src/tests/helpers';
import { AdminController } from '../admin.controller';

describe('AdminController', () => {
  const service = {
    getAccess: asyncMock(),
    listUsers: asyncMock(),
    listAudit: asyncMock(),
    grantRole: asyncMock(),
    revokeRole: asyncMock(),
  };
  const controller = new AdminController(service as never);
  const request = { user: { id: 'session-user', userId: 'authenticated-user' } } as never;
  const targetId = '00000000-0000-4000-8000-000000000001';
  const target = { id: targetId } as never;

  beforeEach(() => jest.clearAllMocks());

  it('returns current access for the authenticated user', async () => {
    service.getAccess.mockResolvedValue({ permissions: [] });

    await expect(controller.getAccess(request)).resolves.toEqual({ permissions: [] });
    expect(service.getAccess).toHaveBeenCalledWith('authenticated-user');
  });

  it('normalizes exact email search and validates page size', async () => {
    service.listUsers.mockResolvedValue([]);

    await expect(controller.listUsers(undefined, undefined)).resolves.toEqual([]);
    expect(service.listUsers).toHaveBeenLastCalledWith(undefined, 50);

    await controller.listUsers('  User@Example.test ', '100');
    expect(service.listUsers).toHaveBeenLastCalledWith('user@example.test', 100);

    await expect(controller.listUsers('x'.repeat(256), undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.listUsers(undefined, '0')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.listUsers(undefined, '101')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.listUsers).toHaveBeenCalledTimes(2);
  });

  it('validates and forwards audit page size', async () => {
    service.listAudit.mockResolvedValue([]);

    await expect(controller.listAudit(undefined)).resolves.toEqual([]);
    await expect(controller.listAudit('10')).resolves.toEqual([]);
    expect(service.listAudit).toHaveBeenNthCalledWith(1, 50);
    expect(service.listAudit).toHaveBeenNthCalledWith(2, 10);
    await expect(controller.listAudit('101')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('grants and revokes recognized roles and rejects unknown role names', async () => {
    service.grantRole.mockResolvedValue(undefined);
    service.revokeRole.mockResolvedValue(undefined);

    await expect(controller.grantRole(target, 'email_sender', request)).resolves.toBeUndefined();
    await expect(controller.revokeRole(target, 'moderator', request)).resolves.toBeUndefined();
    expect(service.grantRole).toHaveBeenCalledWith('authenticated-user', targetId, 'email_sender');
    expect(service.revokeRole).toHaveBeenCalledWith('authenticated-user', targetId, 'moderator');

    await expect(controller.grantRole(target, 'unknown', request)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.revokeRole(target, 'unknown', request)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.grantRole).toHaveBeenCalledTimes(1);
    expect(service.revokeRole).toHaveBeenCalledTimes(1);
  });
});
