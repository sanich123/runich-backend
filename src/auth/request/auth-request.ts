import type { Request } from 'express';

export type AuthenticatedRequest = Request & {
  user: {
    id: string;
    userId?: string;
    sessionId?: string;
    bannedUntil?: Date;
  };
};

export type OptionalAuthenticatedRequest = Omit<AuthenticatedRequest, 'user'> & {
  user?: AuthenticatedRequest['user'];
};

export function getAuthenticatedUserId(request: AuthenticatedRequest) {
  return request.user.userId ?? request.user.id;
}
