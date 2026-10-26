export type AdminRole = 'moderator' | 'email_sender' | 'access_manager' | 'superuser';
export type AdminPermission = 'moderation.manage' | 'email.send' | 'admin.roles.manage';
export type AdminAccess = { roles: AdminRole[]; permissions: AdminPermission[]; isSuperuser: boolean };
