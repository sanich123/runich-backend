import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { firstValueFrom, isObservable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override async canActivate(context: ExecutionContext) {
    const authenticationResult = super.canActivate(context);
    const isAuthenticated = isObservable(authenticationResult)
      ? await firstValueFrom(authenticationResult)
      : await authenticationResult;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bannedUntil = request.user?.bannedUntil;
    const isAppealSubmission =
      request.method === 'POST' && /\/moderation\/reports\/[^/]+\/appeals\/?$/.test(request.path);
    if (bannedUntil && bannedUntil > new Date() && !isAppealSubmission) {
      throw new ForbiddenException('Учётная запись временно заблокирована');
    }
    return isAuthenticated;
  }
}
