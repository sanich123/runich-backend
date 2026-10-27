import { jest } from '@jest/globals';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { asyncMock } from 'src/tests/helpers';
import { AdminAccessService } from '../admin-access.service';
import { makeAdminTarget, makeConfirmedUser } from './fixtures';

describe('AdminAccessService', () => {
  const transaction = {
    user: { findUnique: asyncMock(), count: asyncMock(), update: asyncMock() },
    adminRoleAssignment: { findUnique: asyncMock(), upsert: asyncMock(), update: asyncMock() },
    adminAccessAudit: { create: asyncMock() },
  };
  const prisma = {
    user: { findUnique: asyncMock(), findMany: asyncMock() },
    adminRoleAssignment: { findMany: asyncMock() },
    adminAccessAudit: { findMany: asyncMock() },
    $transaction: jest.fn<(operation: (tx: typeof transaction) => Promise<unknown>) => Promise<unknown>>(
      async (operation) => operation(transaction),
    ),
  };
  const service = new AdminAccessService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (operation) => operation(transaction));
  });

  it('returns no access for missing, unconfirmed, and deleted users', async () => {
    for (const user of [
      null,
      { emailConfirmedAt: null, deletedAt: null, isSuperAdmin: false },
      { emailConfirmedAt: new Date(), deletedAt: new Date(), isSuperAdmin: true },
    ]) {
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.getAccess('user-1')).resolves.toEqual({
        roles: [],
        permissions: [],
        isSuperuser: false,
      });
    }
    expect(prisma.adminRoleAssignment.findMany).not.toHaveBeenCalled();
  });

  it('combines valid role assignments, ignores invalid and legacy superuser rows, and expands superuser permissions', async () => {
    prisma.user.findUnique.mockResolvedValue(makeConfirmedUser(true));
    prisma.adminRoleAssignment.findMany.mockResolvedValue([
      { role: 'moderator' },
      { role: 'moderator' },
      { role: 'email_sender' },
      { role: 'superuser' },
      { role: 'invalid' },
    ]);

    await expect(service.getAccess('user-1')).resolves.toEqual({
      roles: ['moderator', 'email_sender', 'superuser'],
      permissions: ['moderation.manage', 'email.send', 'admin.roles.manage'],
      isSuperuser: true,
    });
  });

  it('checks permissions against confirmed active roles', async () => {
    prisma.user.findUnique.mockResolvedValue(makeConfirmedUser());
    prisma.adminRoleAssignment.findMany.mockResolvedValue([{ role: 'moderator' }]);

    await expect(service.hasPermission('user-1', 'moderation.manage')).resolves.toBe(true);
    await expect(service.hasPermission('user-1', 'email.send')).resolves.toBe(false);
  });

  it('lists normalized confirmed moderator email addresses including superusers', async () => {
    prisma.adminRoleAssignment.findMany.mockResolvedValue([{ userId: 'moderator-1' }]);
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'super-1' }, { id: 'moderator-1' }])
      .mockResolvedValueOnce([
        { email: ' MOD@example.test ' },
        { email: 'mod@example.test' },
        { email: 'SUPER@example.test' },
        { email: '  ' },
      ]);

    await expect(service.listEmailsWithPermission('moderation.manage')).resolves.toEqual([
      'mod@example.test',
      'super@example.test',
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ emailConfirmedAt: { not: null } }) }),
    );
  });

  it('returns no notification recipients without querying users when no role holders exist', async () => {
    prisma.adminRoleAssignment.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);

    await expect(service.listEmailsWithPermission('email.send')).resolves.toEqual([]);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('searches by a normalized partial email and merges assigned and superuser roles', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'target-1', email: 'TARGET@example.test', isSuperAdmin: false },
      { id: 'target-2', email: 'target.team@example.test', isSuperAdmin: false },
      { id: 'target-3', email: 'target@example.test', isSuperAdmin: true },
    ]);
    prisma.adminRoleAssignment.findMany.mockResolvedValue([
      { userId: 'target-1', role: 'moderator' },
      { userId: 'target-1', role: 'moderator' },
      { userId: 'target-1', role: 'bad-role' },
    ]);

    const users = await service.listUsers('target', 10);
    expect(users).toEqual(
      expect.arrayContaining([
        { id: 'target-1', email: 'TARGET@example.test', roles: ['moderator'] },
        { id: 'target-2', email: 'target.team@example.test', roles: [] },
        { id: 'target-3', email: 'target@example.test', roles: ['superuser'] },
      ]),
    );
    expect(users).toHaveLength(3);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { email: 'asc' }, take: 10 }));
  });

  it('lists existing admins, sorts by email, and returns an empty list when no admins exist', async () => {
    prisma.adminRoleAssignment.findMany
      .mockResolvedValueOnce([{ userId: 'role-user' }])
      .mockResolvedValueOnce([
        { userId: 'role-user', role: 'access_manager' },
        { userId: 'role-user', role: 'invalid' },
      ])
      .mockResolvedValueOnce([]);
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'super-user' }])
      .mockResolvedValueOnce([
        { id: 'role-user', email: 'z@example.test', isSuperAdmin: false },
        { id: 'super-user', email: 'a@example.test', isSuperAdmin: true },
      ])
      .mockResolvedValueOnce([]);

    await expect(service.listUsers(undefined, 50)).resolves.toEqual([
      { id: 'super-user', email: 'a@example.test', roles: ['superuser'] },
      { id: 'role-user', email: 'z@example.test', roles: ['access_manager'] },
    ]);
    await expect(service.listUsers(undefined, 50)).resolves.toEqual([]);
  });

  it('filters invalid audit rows and serializes dates', async () => {
    const createdAt = new Date('2026-10-22T10:00:00.000Z');
    prisma.adminAccessAudit.findMany.mockResolvedValue([
      { id: 'audit-1', role: 'moderator', action: 'granted', createdAt },
      { id: 'audit-2', role: 'email_sender', action: 'revoked', createdAt: '2026-10-21T10:00:00.000Z' },
      { id: 'audit-3', role: 'unknown', action: 'granted', createdAt },
      { id: 'audit-4', role: 'moderator', action: 'changed', createdAt },
    ]);

    await expect(service.listAudit(10)).resolves.toEqual([
      expect.objectContaining({ id: 'audit-1', createdAt: createdAt.toISOString() }),
      expect.objectContaining({ id: 'audit-2', createdAt: '2026-10-21T10:00:00.000Z' }),
    ]);
  });

  it('grants and audits an ordinary role for an access manager', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(makeConfirmedUser())
      .mockResolvedValueOnce(makeAdminTarget())
      .mockResolvedValueOnce({ email: 'manager@example.test' });
    prisma.adminRoleAssignment.findMany.mockResolvedValue([{ role: 'access_manager' }]);
    transaction.adminRoleAssignment.findUnique.mockResolvedValue(null);

    await service.grantRole('manager-1', 'target-1', 'moderator');

    expect(transaction.adminRoleAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: 'target-1', role: 'moderator', grantedByUserId: 'manager-1' }),
      }),
    );
    expect(transaction.adminAccessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorEmail: 'manager@example.test',
          targetEmail: 'target@example.test',
          action: 'granted',
        }),
      }),
    );
  });

  it('does not duplicate an already active grant and can grant the legacy superuser flag', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(makeConfirmedUser(true))
      .mockResolvedValueOnce(makeAdminTarget())
      .mockResolvedValueOnce(makeConfirmedUser(true))
      .mockResolvedValueOnce(makeAdminTarget())
      .mockResolvedValueOnce({ email: 'root@example.test' })
      .mockResolvedValueOnce({ id: 'target-1', isSuperAdmin: false });
    prisma.adminRoleAssignment.findMany.mockResolvedValue([]);
    transaction.adminRoleAssignment.findUnique.mockResolvedValue({ isActive: true });

    await service.grantRole('root-1', 'target-1', 'moderator');
    expect(transaction.adminRoleAssignment.upsert).not.toHaveBeenCalled();
    expect(transaction.adminAccessAudit.create).not.toHaveBeenCalled();

    await service.grantRole('root-1', 'target-1', 'superuser');
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 'target-1' },
      data: { isSuperAdmin: true },
    });
    expect(transaction.adminAccessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'superuser', action: 'granted' }) }),
    );
  });

  it('rejects self edits, unauthorized managers, and deleted targets', async () => {
    await expect(service.grantRole('user-1', 'user-1', 'moderator')).rejects.toBeInstanceOf(ForbiddenException);

    prisma.user.findUnique.mockResolvedValue(makeConfirmedUser());
    prisma.adminRoleAssignment.findMany.mockResolvedValue([]);
    await expect(service.grantRole('user-1', 'target-1', 'moderator')).rejects.toBeInstanceOf(ForbiddenException);

    prisma.user.findUnique
      .mockResolvedValueOnce(makeConfirmedUser(true))
      .mockResolvedValueOnce(makeAdminTarget({ deletedAt: new Date() }));
    prisma.adminRoleAssignment.findMany.mockResolvedValue([]);
    await expect(service.grantRole('root-1', 'target-1', 'moderator')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restricts access managers from granting superuser status', async () => {
    prisma.user.findUnique.mockResolvedValue(makeConfirmedUser());
    prisma.adminRoleAssignment.findMany.mockResolvedValue([{ role: 'access_manager' }]);

    await expect(service.grantRole('manager-1', 'target-1', 'superuser')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('revokes roles and prevents removing the last confirmed superuser', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(makeConfirmedUser(true))
      .mockResolvedValueOnce(makeAdminTarget())
      .mockResolvedValueOnce({ email: 'root@example.test' });
    prisma.adminRoleAssignment.findMany.mockResolvedValue([]);
    transaction.adminRoleAssignment.findUnique.mockResolvedValue({ isActive: true });

    await service.revokeRole('root-1', 'target-1', 'moderator');
    expect(transaction.adminRoleAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
    );
    expect(transaction.adminAccessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'revoked' }) }),
    );

    prisma.user.findUnique
      .mockResolvedValueOnce(makeConfirmedUser(true))
      .mockResolvedValueOnce(makeAdminTarget())
      .mockResolvedValueOnce({ email: 'root@example.test' });
    transaction.user.findUnique.mockResolvedValue({ isSuperAdmin: true });
    transaction.user.count.mockResolvedValue(1);
    await expect(service.revokeRole('root-1', 'target-1', 'superuser')).rejects.toBeInstanceOf(ConflictException);
  });

  it('is idempotent when revoking inactive assignments or granting an existing superuser', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(makeConfirmedUser(true))
      .mockResolvedValueOnce(makeAdminTarget())
      .mockResolvedValueOnce(makeConfirmedUser(true))
      .mockResolvedValueOnce(makeAdminTarget())
      .mockResolvedValueOnce({ email: 'root@example.test' })
      .mockResolvedValueOnce({ id: 'target-1', isSuperAdmin: true });
    prisma.adminRoleAssignment.findMany.mockResolvedValue([]);
    transaction.adminRoleAssignment.findUnique.mockResolvedValue({ isActive: false });
    transaction.user.findUnique.mockResolvedValue({ isSuperAdmin: true });

    await service.revokeRole('root-1', 'target-1', 'moderator');
    await service.grantRole('root-1', 'target-1', 'superuser');

    expect(transaction.adminRoleAssignment.update).not.toHaveBeenCalled();
    expect(transaction.user.update).not.toHaveBeenCalled();
    expect(transaction.adminAccessAudit.create).not.toHaveBeenCalled();
  });

  it('allows revoking a superuser while another confirmed, active superuser remains', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(makeConfirmedUser(true))
      .mockResolvedValueOnce(makeAdminTarget())
      .mockResolvedValueOnce({ email: 'root@example.test' });
    prisma.adminRoleAssignment.findMany.mockResolvedValue([]);
    transaction.user.findUnique.mockResolvedValue({ isSuperAdmin: true });
    transaction.user.count.mockResolvedValue(2);

    await service.revokeRole('root-1', 'target-1', 'superuser');

    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 'target-1' },
      data: { isSuperAdmin: false },
    });
    expect(transaction.adminAccessAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'superuser', action: 'revoked' }) }),
    );
  });
});
