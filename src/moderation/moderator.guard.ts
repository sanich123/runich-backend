import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { AdminAccessService } from 'src/admin/admin-access.service';

@Injectable()
export class ModeratorGuard implements CanActivate {
  constructor(@Inject(AdminAccessService) private readonly adminAccess: AdminAccessService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!(await this.adminAccess.hasPermission(getAuthenticatedUserId(request), 'moderation.manage'))) {
      throw new ForbiddenException('Недостаточно прав модератора');
    }
    return true;
  }
}
