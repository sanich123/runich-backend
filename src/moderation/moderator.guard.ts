import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

import { MODERATOR_EMAILS } from './moderation.constants';

@Injectable()
export class ModeratorGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = getAuthenticatedUserId(request);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailConfirmedAt: true },
    });
    const email = user?.email?.trim().toLowerCase();
    if (!email || !user?.emailConfirmedAt || !MODERATOR_EMAILS.has(email)) {
      throw new ForbiddenException('Недостаточно прав модератора');
    }
    return true;
  }
}
