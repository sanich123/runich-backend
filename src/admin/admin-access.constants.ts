import type { AdminAccess, AdminPermission, AdminRole } from './admin-access.types';

export const ADMIN_ROLES = [
  'moderator',
  'email_sender',
  'access_manager',
  'superuser',
] as const satisfies readonly AdminRole[];
export const ADMIN_PERMISSIONS = [
  'moderation.manage',
  'email.send',
  'admin.roles.manage',
] as const satisfies readonly AdminPermission[];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  moderator: ['moderation.manage'],
  email_sender: ['email.send'],
  access_manager: ['admin.roles.manage'],
  superuser: ADMIN_PERMISSIONS,
};
export const ACCESS_MANAGER_ROLES: readonly AdminRole[] = ['moderator', 'email_sender'];
export const EMPTY_ACCESS: AdminAccess = { roles: [], permissions: [], isSuperuser: false };
