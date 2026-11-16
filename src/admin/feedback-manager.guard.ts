import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { AdminAccessService } from './admin-access.service';

@Injectable()
export class FeedbackManagerGuard implements CanActivate {
  constructor(@Inject(AdminAccessService) private readonly adminAccess: AdminAccessService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!(await this.adminAccess.hasPermission(getAuthenticatedUserId(request), 'feedback.manage'))) {
      throw new ForbiddenException('Недостаточно прав для работы с обращениями');
    }
    return true;
  }
}
