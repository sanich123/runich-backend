import { AccountService } from 'src/account/account.service';
import { CommentService } from 'src/comment/comment.service';
import { CommentLikeService } from 'src/comment/comment-like.service';
import { ActivityMetricsService } from 'src/statistic/activity-metrics.service';
import { StatisticService } from 'src/statistic/statistic.service';
import { FriendService } from 'src/friend/friend.service';
import { UserService } from 'src/user/user.service';
import { AuthService } from 'src/auth/services/auth.service';
import { AuthEmailService } from 'src/auth/services/auth-email.service';
import { AuthTokenService } from 'src/auth/services/auth-token.service';
import { YandexAuthService } from 'src/auth/services/yandex-auth.service';
import { VkAuthService } from 'src/auth/services/vk-auth.service';
import { AppleAuthService } from 'src/auth/services/apple-auth.service';
import { SuperuserEmailBootstrapService } from 'src/auth/services/superuser-email-bootstrap.service';
import { asyncMock } from '../helpers';

function createModerationAccessMock() {
  return {
    areBlocked: asyncMock().mockResolvedValue(false),
    blockedUserIds: asyncMock().mockResolvedValue([]),
  };
}

export function createAccountServiceForTest(prisma: unknown, moderationAccess?: unknown, storage?: unknown) {
  return new AccountService(
    prisma as never,
    (moderationAccess ?? createModerationAccessMock()) as never,
    storage as never,
  );
}

export function createUserServiceForTest(
  prisma: unknown,
  latencyMetrics?: unknown,
  storage?: unknown,
  moderationAccess?: unknown,
) {
  return new UserService(
    prisma as never,
    (moderationAccess ?? createModerationAccessMock()) as never,
    latencyMetrics as never,
    storage as never,
  );
}

export function createFriendServiceForTest(prisma: unknown, account: unknown, moderationAccess?: unknown) {
  return new FriendService(
    prisma as never,
    account as never,
    (moderationAccess ?? createModerationAccessMock()) as never,
  );
}

export function createCommentServiceForTest(
  prisma: unknown,
  account: unknown,
  activity: unknown,
  commentLike?: unknown,
  moderationAccess?: unknown,
) {
  return new CommentService(
    prisma as never,
    account as never,
    activity as never,
    (commentLike ?? new CommentLikeService(prisma as never)) as never,
    (moderationAccess ?? createModerationAccessMock()) as never,
  );
}

export function createStatisticServiceForTest(prisma: unknown) {
  return new StatisticService(prisma as never, new ActivityMetricsService());
}

export function createAuthServiceForTest(
  prisma: unknown,
  jwt: unknown,
  email: unknown,
  tokenService?: unknown,
  yandexAuthService?: unknown,
  authEmailService?: unknown,
  vkAuthService?: unknown,
  mediaCleanupService?: unknown,
  superuserEmailBootstrapService?: unknown,
  appleAuthService?: unknown,
) {
  const tokens = (tokenService ?? new AuthTokenService(jwt as never)) as never;
  const superuserBootstrap = (superuserEmailBootstrapService ??
    new SuperuserEmailBootstrapService(prisma as never)) as never;
  return new AuthService(
    prisma as never,
    jwt as never,
    email as never,
    tokens,
    (yandexAuthService ?? new YandexAuthService(prisma as never, tokens, superuserBootstrap)) as never,
    (authEmailService ?? new AuthEmailService(email as never)) as never,
    (vkAuthService ?? new VkAuthService(prisma as never, jwt as never, tokens, superuserBootstrap)) as never,
    (mediaCleanupService ?? { enqueueUserCleanup: asyncMock() }) as never,
    superuserBootstrap,
    (appleAuthService ?? new AppleAuthService(prisma as never, tokens, superuserBootstrap)) as never,
  );
}
