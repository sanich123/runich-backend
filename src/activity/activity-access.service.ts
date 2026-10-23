import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationAccessService } from 'src/moderation/moderation-access.service';
import { ACTIVITY_VISIBLE_TO_FOLLOWERS, ACTIVITY_VISIBILITY } from './activity-visibility';

@Injectable()
export class ActivityAccessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(ModerationAccessService) moderationAccess?: ModerationAccessService,
  ) {
    this.moderationAccess = moderationAccess ?? new ModerationAccessService(this.prisma);
  }

  private readonly moderationAccess: ModerationAccessService;

  async isFollower(viewerId: string, ownerId: string) {
    if (viewerId === ownerId || (await this.moderationAccess.areBlocked(viewerId, ownerId))) return false;
    const relation = await this.prisma.friend.findUnique({
      where: { userId_friendId: { userId: viewerId, friendId: ownerId } },
      select: { id: true },
    });
    return Boolean(relation);
  }

  async getVisibilityFilter(ownerId: string, currentUserId?: string) {
    if (!currentUserId || currentUserId === ownerId) return {};
    if (await this.moderationAccess.areBlocked(currentUserId, ownerId)) return { id: { in: [] } };
    const followsOwner = await this.isFollower(currentUserId, ownerId);
    return followsOwner
      ? { visibility: { in: ACTIVITY_VISIBLE_TO_FOLLOWERS } }
      : { visibility: ACTIVITY_VISIBILITY.public };
  }

  async getBlockedUserIds(userId: string) {
    return await this.moderationAccess.blockedUserIds(userId);
  }

  async canAccessActivity(id: string, currentUserId?: string) {
    if (!currentUserId) return false;

    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: { userId: true, visibility: true, moderationStatus: true },
    });

    return this.canAccessActivityData(activity, currentUserId);
  }

  async canAccessActivityData(
    activity: { userId: string; visibility: string; moderationStatus?: string } | null,
    currentUserId?: string,
  ) {
    if (!activity || !currentUserId || (activity.moderationStatus && activity.moderationStatus !== 'visible'))
      return false;
    if (activity.userId !== currentUserId && (await this.moderationAccess.areBlocked(currentUserId, activity.userId))) {
      return false;
    }
    if (activity.userId === currentUserId || activity.visibility === ACTIVITY_VISIBILITY.public) return true;
    if (activity.visibility !== ACTIVITY_VISIBILITY.followers) return false;
    return this.isFollower(currentUserId, activity.userId);
  }

  async canInteractWithActivity(id: string, currentUserId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: {
        userId: true,
        moderationStatus: true,
        profile: { select: { allowActivityInteractions: true } },
      },
    });

    if (!activity || activity.moderationStatus !== 'visible') return false;
    if (await this.moderationAccess.areBlocked(currentUserId, activity.userId)) return false;
    return activity.userId === currentUserId || activity.profile?.allowActivityInteractions !== false;
  }
}
