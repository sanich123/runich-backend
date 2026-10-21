import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ACTIVITY_VISIBLE_TO_FOLLOWERS, ACTIVITY_VISIBILITY } from './activity-visibility';

@Injectable()
export class ActivityAccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async isFollower(viewerId: string, ownerId: string) {
    if (viewerId === ownerId) return false;
    const relation = await this.prisma.friend.findUnique({
      where: { userId_friendId: { userId: viewerId, friendId: ownerId } },
      select: { id: true },
    });
    return Boolean(relation);
  }

  async getVisibilityFilter(ownerId: string, currentUserId?: string) {
    if (!currentUserId || currentUserId === ownerId) return {};
    const followsOwner = await this.isFollower(currentUserId, ownerId);
    return followsOwner
      ? { visibility: { in: ACTIVITY_VISIBLE_TO_FOLLOWERS } }
      : { visibility: ACTIVITY_VISIBILITY.public };
  }

  async canAccessActivity(id: string, currentUserId?: string) {
    if (!currentUserId) return false;

    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: { userId: true, visibility: true },
    });

    return this.canAccessActivityData(activity, currentUserId);
  }

  async canAccessActivityData(activity: { userId: string; visibility: string } | null, currentUserId?: string) {
    if (!activity || !currentUserId) return false;
    if (activity.userId === currentUserId || activity.visibility === ACTIVITY_VISIBILITY.public) return true;
    if (activity.visibility !== ACTIVITY_VISIBILITY.followers) return false;
    return this.isFollower(currentUserId, activity.userId);
  }

  async canInteractWithActivity(id: string, currentUserId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      select: {
        userId: true,
        profile: { select: { allowActivityInteractions: true } },
      },
    });

    return Boolean(
      activity && (activity.userId === currentUserId || activity.profile?.allowActivityInteractions !== false),
    );
  }
}
