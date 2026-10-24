import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

export const ADMIN_ROLES = ['moderator', 'email_sender', 'access_manager', 'superuser'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = ['moderation.manage', 'email.send', 'admin.roles.manage'] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  moderator: ['moderation.manage'],
  email_sender: ['email.send'],
  access_manager: ['admin.roles.manage'],
  superuser: ADMIN_PERMISSIONS,
};
const ACCESS_MANAGER_ROLES: readonly AdminRole[] = ['moderator', 'email_sender'];
const EMPTY_ACCESS = { roles: [] as AdminRole[], permissions: [] as AdminPermission[], isSuperuser: false };

function isAdminRole(role: string): role is AdminRole {
  return ADMIN_ROLES.includes(role as AdminRole);
}

@Injectable()
export class AdminAccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getAccess(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailConfirmedAt: true, deletedAt: true, isSuperAdmin: true },
    });
    if (!user?.emailConfirmedAt || user.deletedAt) return EMPTY_ACCESS;

    const assignments = await this.prisma.adminRoleAssignment.findMany({
      where: { userId, isActive: true },
      select: { role: true },
    });
    const roles: AdminRole[] = [
      ...new Set((assignments as Array<{ role: string }>).map(({ role }) => role).filter(isAdminRole)),
    ].filter((role) => role !== 'superuser');
    const isSuperuser = user.isSuperAdmin === true;
    if (isSuperuser) roles.push('superuser');
    const permissions = isSuperuser
      ? [...ADMIN_PERMISSIONS]
      : [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
    return { roles, permissions, isSuperuser };
  }

  async hasPermission(userId: string, permission: AdminPermission) {
    const access = await this.getAccess(userId);
    return access.permissions.includes(permission);
  }

  async listEmailsWithPermission(permission: AdminPermission): Promise<string[]> {
    const roles = ADMIN_ROLES.filter((role) => ROLE_PERMISSIONS[role].includes(permission));
    const assignments = await this.prisma.adminRoleAssignment.findMany({
      where: { role: { in: roles }, isActive: true },
      select: { userId: true },
    });
    const userIds = new Set(assignments.map(({ userId }: { userId: string }) => userId));
    if (roles.includes('superuser')) {
      const superusers = await this.prisma.user.findMany({
        where: { isSuperAdmin: true, deletedAt: null },
        select: { id: true },
      });
      for (const { id } of superusers as Array<{ id: string }>) userIds.add(id);
    }
    if (!userIds.size) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] }, emailConfirmedAt: { not: null }, deletedAt: null },
      select: { email: true },
    });
    const emails = (users as Array<{ email: string }>).map(({ email }) => email.trim().toLowerCase()).filter(Boolean);
    return [...new Set<string>(emails)];
  }

  async listUsers(email: string | undefined, take: number) {
    let users: Array<{ id: string; email: string; isSuperAdmin?: boolean | null }> = [];
    if (email) {
      const matches = await this.prisma.user.findMany({
        where: { email: { contains: email, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, email: true, isSuperAdmin: true },
        orderBy: { email: 'asc' },
        take,
      });
      users = matches;
    } else {
      const assignments = await this.prisma.adminRoleAssignment.findMany({
        where: { isActive: true },
        select: { userId: true },
      });
      const userIds = new Set(assignments.map(({ userId }: { userId: string }) => userId));
      const superusers = await this.prisma.user.findMany({
        where: { isSuperAdmin: true, deletedAt: null },
        select: { id: true },
      });
      for (const { id } of superusers as Array<{ id: string }>) userIds.add(id);
      if (userIds.size) {
        users = await this.prisma.user.findMany({
          where: { id: { in: [...userIds] }, deletedAt: null },
          select: { id: true, email: true, isSuperAdmin: true },
          take,
        });
      }
    }
    if (!users.length) return [];

    const assignments = await this.prisma.adminRoleAssignment.findMany({
      where: { userId: { in: users.map(({ id }) => id) }, isActive: true },
      select: { userId: true, role: true },
    });
    const rolesByUser = new Map<string, AdminRole[]>();
    for (const assignment of assignments as Array<{ userId: string; role: string }>) {
      if (!isAdminRole(assignment.role)) continue;
      const roles = rolesByUser.get(assignment.userId) ?? [];
      roles.push(assignment.role);
      rolesByUser.set(assignment.userId, roles);
    }

    return users
      .map(({ id, email: userEmail }) => ({
        id,
        email: userEmail,
        roles: [
          ...new Set([
            ...(rolesByUser.get(id) ?? []),
            ...(users.find((user) => user.id === id)?.isSuperAdmin ? ['superuser' as const] : []),
          ]),
        ],
      }))
      .sort((first, second) => first.email.localeCompare(second.email));
  }

  async listAudit(take: number) {
    const events = await this.prisma.adminAccessAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, actorEmail: true, targetEmail: true, role: true, action: true, createdAt: true },
    });
    return (events as Array<Record<string, unknown>>)
      .filter(
        (event): event is Record<string, unknown> & { role: AdminRole; action: 'granted' | 'revoked' } =>
          isAdminRole(String(event.role)) && (event.action === 'granted' || event.action === 'revoked'),
      )
      .map((event) => ({
        ...event,
        createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt),
      }));
  }

  async grantRole(actorId: string, targetId: string, role: AdminRole) {
    await this.assertCanManageRole(actorId, targetId, role);
    const target = await this.getTarget(targetId);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      if (role === 'superuser') {
        const existing = await transaction.user.findUnique({ where: { id: targetId }, select: { isSuperAdmin: true } });
        if (existing?.isSuperAdmin) return;
        await transaction.user.update({ where: { id: targetId }, data: { isSuperAdmin: true } });
      } else {
        const where = { userId_role: { userId: targetId, role } };
        const existing = await transaction.adminRoleAssignment.findUnique({ where });
        if (existing?.isActive) return;
        await transaction.adminRoleAssignment.upsert({
          where,
          create: { userId: targetId, role, isActive: true, grantedByUserId: actorId },
          update: { isActive: true, grantedByUserId: actorId, updatedAt: now },
        });
      }
      await transaction.adminAccessAudit.create({
        data: {
          actorUserId: actorId,
          targetUserId: targetId,
          actorEmail: await this.getActorEmail(actorId),
          targetEmail: target.email,
          role,
          action: 'granted',
        },
      });
    });
  }

  async revokeRole(actorId: string, targetId: string, role: AdminRole) {
    await this.assertCanManageRole(actorId, targetId, role);
    const target = await this.getTarget(targetId);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      if (role === 'superuser') {
        const existing = await transaction.user.findUnique({
          where: { id: targetId },
          select: { isSuperAdmin: true },
        });
        if (!existing?.isSuperAdmin) return;
        const superuserCount = await transaction.user.count({
          where: { isSuperAdmin: true, emailConfirmedAt: { not: null }, deletedAt: null },
        });
        if (superuserCount <= 1) {
          throw new ConflictException('Нельзя отозвать права у последнего суперпользователя');
        }
        await transaction.user.update({ where: { id: targetId }, data: { isSuperAdmin: false } });
      } else {
        const where = { userId_role: { userId: targetId, role } };
        const existing = await transaction.adminRoleAssignment.findUnique({ where });
        if (!existing?.isActive) return;
        await transaction.adminRoleAssignment.update({
          where,
          data: { isActive: false, updatedAt: now },
        });
      }
      await transaction.adminAccessAudit.create({
        data: {
          actorUserId: actorId,
          targetUserId: targetId,
          actorEmail: await this.getActorEmail(actorId),
          targetEmail: target.email,
          role,
          action: 'revoked',
        },
      });
    });
  }

  private async assertCanManageRole(actorId: string, targetId: string, role: AdminRole) {
    if (actorId === targetId) throw new ForbiddenException('Нельзя менять собственные права доступа');
    const access = await this.getAccess(actorId);
    if (!access.permissions.includes('admin.roles.manage')) {
      throw new ForbiddenException('Недостаточно прав для управления доступом');
    }
    if (!access.isSuperuser && !ACCESS_MANAGER_ROLES.includes(role)) {
      throw new ForbiddenException('Выдавать права доступа могут только суперпользователи');
    }
  }

  private async getTarget(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw new NotFoundException('Пользователь не найден');
    return user as { id: string; email: string };
  }

  private async getActorEmail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) throw new NotFoundException('Пользователь не найден');
    return user.email as string;
  }
}
