import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationAccessService } from 'src/moderation/services/moderation-access.service';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import type { UpdateGroupPreferencesDto } from '../dto/groups-members.dto';
import type { GroupMemberListItem, GroupMemberQueryRow, GroupRow, Membership } from '../shared/groups.types';
import { GroupSummaryService } from './groups-summary.service';
import { createGroupPage, encodeGroupDateCursor } from '../shared/groups.pagination';
import type { GroupDateCursor, GroupPage } from '../shared/groups.pagination';

@Injectable()
export class GroupsMembersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModerationAccessService) private readonly moderationAccess: ModerationAccessService,
    @Inject(GroupSummaryService) private readonly groupSummaryService: GroupSummaryService,
  ) {}
  async joinGroup(userId: string, groupId: string) {
    try {
      const group: Pick<GroupRow, 'id' | 'privacy' | 'createdByUserId'> | null = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, privacy: true, createdByUserId: true },
      });
      if (!group) throw new NotFoundException('Group not found');
      if (await this.moderationAccess.areBlocked(userId, group.createdByUserId)) {
        throw new ForbiddenException('This group is unavailable');
      }
      const existing: Pick<Membership, 'status'> | null = await this.prisma.groupMember.findUnique({
        where: { groupId, userId },
        select: { status: true },
      });
      if (existing?.status === 'active') return this.groupSummaryService.getGroup(userId, groupId);
      const status = group.privacy === 'open' ? 'active' : 'pending';
      const now = new Date().toISOString();
      const membership = await this.prisma.groupMember.upsert({
        where: { groupId, userId },
        create: {
          groupId,
          userId,
          role: 'member',
          status,
          requestedAt: now,
          joinedAt: status === 'active' ? now : null,
        },
        update: { status, requestedAt: now, joinedAt: status === 'active' ? now : null },
        select: { id: true },
      });
      if (status === 'pending' && existing?.status !== 'pending') {
        await this.prisma.emailNotificationJob.upsert({
          where: {
            notificationType_sourceId: {
              notificationType: EMAIL_NOTIFICATION_TYPE.groupJoinRequest,
              sourceId: membership.id,
            },
          },
          create: {
            notificationType: EMAIL_NOTIFICATION_TYPE.groupJoinRequest,
            sourceId: membership.id,
            status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
          },
          update: {
            status: EMAIL_NOTIFICATION_JOB_STATUS.queued,
            attempts: 0,
            availableAt: new Date(now),
            errorMessage: null,
            startedAt: null,
            finishedAt: null,
          },
        });
      }
      return this.groupSummaryService.getGroup(userId, groupId);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async leaveGroup(userId: string, groupId: string) {
    try {
      const membership: Pick<Membership, 'role'> | null = await this.prisma.groupMember.findUnique({
        where: { groupId, userId },
        select: { role: true },
      });
      if (!membership) return;
      if (membership.role === 'owner') throw new ForbiddenException('Transfer group ownership before leaving');
      await this.prisma.groupMember.delete({ where: { groupId, userId } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  getMembers(userId: string, groupId: string, status: 'active' | 'pending'): Promise<GroupMemberListItem[]>;

  getMembers(
    userId: string,
    groupId: string,
    status: 'active' | 'pending',
    pageSize: number,
    cursor: GroupDateCursor | undefined,
    paginationRequested: boolean,
  ): Promise<GroupMemberListItem[] | GroupPage<GroupMemberListItem>>;

  async getMembers(
    userId: string,
    groupId: string,
    status: 'active' | 'pending',
    pageSize = 100,
    cursor?: GroupDateCursor,
    paginationRequested = false,
  ) {
    try {
      const group: GroupRow | null = await this.prisma.group.findUnique({
        where: { id: groupId },
        include: { members: { where: { userId }, select: { role: true, status: true } } },
      });
      if (!group) throw new NotFoundException('Group not found');
      const current = group.members?.[0];
      const isOwner = group.createdByUserId === userId;
      const canManage =
        isOwner || (current?.status === 'active' && (current.role === 'owner' || current.role === 'admin'));
      if (status === 'pending' && !canManage) throw new ForbiddenException('Only group admins can view join requests');
      if (status === 'active' && group.privacy === 'closed' && current?.status !== 'active' && !isOwner) {
        throw new ForbiddenException('Join this group to view its members');
      }
      const blockedIds = await this.moderationAccess.blockedUserIds(userId);
      const rows: GroupMemberQueryRow[] = await this.prisma.groupMember.findMany({
        where: {
          groupId,
          status,
          ...(blockedIds.length ? { userId: { notIn: blockedIds } } : {}),
          ...(paginationRequested && cursor
            ? {
                OR: [{ requestedAt: { gt: cursor.date } }, { requestedAt: cursor.date, id: { gt: cursor.id } }],
              }
            : {}),
        },
        include: {
          user: {
            include: {
              profile: {
                select: {
                  name: true,
                  surname: true,
                  city: true,
                  profilePhoto: true,
                  hideProfilePhotos: true,
                  profileSearchVisible: true,
                },
              },
            },
          },
        },
        orderBy: paginationRequested ? [{ requestedAt: 'asc' }, { id: 'asc' }] : { requestedAt: 'asc' },
        take: paginationRequested ? pageSize + 1 : 200,
      });
      const mapMember = (member: GroupMemberQueryRow) => ({
        userId: member.userId,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
        profile: member.user?.profile
          ? {
              name: member.user.profile.name,
              surname: member.user.profile.surname,
              city: member.user.profile.profileSearchVisible === false ? null : member.user.profile.city,
              profilePhoto: member.user.profile.hideProfilePhotos ? null : member.user.profile.profilePhoto,
            }
          : null,
      });
      if (!paginationRequested) return rows.map(mapMember);
      const page = createGroupPage(rows, pageSize, (lastMember) =>
        encodeGroupDateCursor({ date: new Date(lastMember.requestedAt), id: lastMember.id }),
      );
      return {
        ...page,
        items: page.items.map(mapMember),
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async updateMember(
    actorUserId: string,
    groupId: string,
    targetUserId: string,
    status: 'active' | 'rejected' | 'removed',
  ) {
    try {
      const actor: Membership | null = await this.prisma.groupMember.findUnique({
        where: { groupId, userId: actorUserId },
        select: { role: true, status: true },
      });
      const hasManageRole = actor?.status === 'active' && (actor.role === 'owner' || actor.role === 'admin');
      let isOwner = actor?.status === 'active' && actor.role === 'owner';
      if (!hasManageRole) {
        const group: Pick<GroupRow, 'createdByUserId'> | null = await this.prisma.group.findUnique({
          where: { id: groupId },
          select: { createdByUserId: true },
        });
        if (!group) throw new NotFoundException('Group not found');
        isOwner = group.createdByUserId === actorUserId;
      }
      if (!hasManageRole && !isOwner) {
        throw new ForbiddenException('Only group admins can manage members');
      }
      const target: Membership | null = await this.prisma.groupMember.findUnique({
        where: { groupId, userId: targetUserId },
        select: { role: true, status: true },
      });
      if (!target) throw new NotFoundException('Membership not found');
      if (target.role === 'owner' || (!isOwner && target.role === 'admin')) {
        throw new ForbiddenException('You cannot manage this member');
      }
      if (status === 'active' && target.status !== 'pending')
        throw new ForbiddenException('Only pending requests can be approved');
      if (status === 'rejected' && target.status !== 'pending')
        throw new ForbiddenException('Only pending requests can be declined');
      if (status === 'removed') {
        if (target.status !== 'active') throw new ForbiddenException('Only active members can be removed');
        await this.prisma.groupMember.delete({ where: { groupId, userId: targetUserId } });
        return { userId: targetUserId, role: target.role, status };
      }
      const joinedAt = status === 'active' ? new Date().toISOString() : null;
      const updated: { userId: string; role: string; status: string; joinedAt: Date | string | null } =
        await this.prisma.groupMember.update({
          where: { groupId, userId: targetUserId },
          data: { status, joinedAt },
        });
      return {
        userId: updated.userId,
        role: updated.role,
        status: updated.status,
        joinedAt: updated.joinedAt,
        profile: null,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async updatePreferences(userId: string, groupId: string, preferences: UpdateGroupPreferencesDto) {
    try {
      const membership = await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { status: true },
      });
      if (!membership || membership.status !== 'active') {
        throw new ForbiddenException('Only active group members can change group preferences');
      }
      return await this.prisma.groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: preferences,
        select: { notificationPreference: true, feedPreference: true },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }
}
