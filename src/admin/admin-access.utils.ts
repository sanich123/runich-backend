import { ADMIN_ROLES } from './admin-access.constants';
import type { AdminRole } from './admin-access.types';

export function isAdminRole(role: string): role is AdminRole {
  return ADMIN_ROLES.includes(role as AdminRole);
}
