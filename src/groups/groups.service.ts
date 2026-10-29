import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationAccessService } from 'src/moderation/moderation-access.service';
import type { CreateGroupDto, ListGroupsQueryDto } from './groups.dto';
import { GROUP_SPORTS } from './groups.dto';

type Membership = { role: 'owner' | 'admin' | 'member'; status: 'active' | 'pending' | 'rejected' };
type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  sports: string[];
  privacy: 'open' | 'closed';
  locationName: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdByUserId: string;
  members?: Membership[];
  _count?: { members?: number };
};

@Injectable()
export class GroupsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModerationAccessService) private readonly moderationAccess: ModerationAccessService,
  ) {}

  async getGroups(userId: string, query: ListGroupsQueryDto) {
    try {
      const where: Record<string, unknown> = {};
      const blockedIds = await this.moderationAccess.blockedUserIds(userId);
      if (blockedIds.length) where.createdByUserId = { notIn: blockedIds };
      if (query.scope === 'mine') where.members = { some: { userId, status: { in: ['active', 'pending'] } } };
      const search = query.search?.trim();
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { locationName: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (query.sport) {
        const sportGroups = await this.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "public"."Group"
          WHERE "sports" @> ARRAY[${query.sport}]::text[]
        `;
        if (sportGroups.length === 0) return [];
        where.id = { in: sportGroups.map(({ id }) => id) };
      }
      const groups = (await this.prisma.group.findMany({
        where,
        include: {
          members: { where: { userId }, select: { role: true, status: true } },
          _count: { select: { members: { where: { status: 'active' } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })) as GroupRow[];
      return await Promise.all(groups.map((group) => this.toSummary(group)));
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createGroup(userId: string, body: CreateGroupDto) {
    try {
      const name = body.name.trim();
      if (name.length < 2) throw new BadRequestException('Group name must contain at least two characters');
      const sports = [...new Set(body.sports)];
      if (sports.some((sport) => !GROUP_SPORTS.includes(sport as (typeof GROUP_SPORTS)[number]))) {
        throw new ForbiddenException('Unsupported group activity');
      }
      const group = (await this.prisma.group.create({
        data: {
          name,
          description: body.description?.trim() || null,
          sports,
          privacy: body.privacy,
          locationName: body.locationName?.trim() || null,
          createdByUserId: userId,
          members: {
            create: { userId, role: 'owner', status: 'active', joinedAt: new Date().toISOString() },
          },
        },
      })) as GroupRow;
      return this.getGroup(userId, group.id);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getGroup(userId: string, groupId: string) {
    try {
      const group = (await this.prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: { where: { userId }, select: { role: true, status: true } },
          _count: { select: { members: { where: { status: 'active' } } } },
        },
      })) as GroupRow | null;
      if (!group) throw new NotFoundException('Group not found');
      if (await this.moderationAccess.areBlocked(userId, group.createdByUserId)) {
        throw new ForbiddenException('This group is unavailable');
      }
      return await this.toSummary(group, true);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async joinGroup(userId: string, groupId: string) {
    try {
      const group = (await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, privacy: true, createdByUserId: true },
      })) as { id: string; privacy: 'open' | 'closed'; createdByUserId: string } | null;
      if (!group) throw new NotFoundException('Group not found');
      if (await this.moderationAccess.areBlocked(userId, group.createdByUserId)) {
        throw new ForbiddenException('This group is unavailable');
      }
      const existing = (await this.prisma.groupMember.findUnique({
        where: { groupId, userId },
        select: { status: true },
      })) as { status: 'active' | 'pending' | 'rejected' } | null;
      if (existing?.status === 'active') return this.getGroup(userId, groupId);
      const status = group.privacy === 'open' ? 'active' : 'pending';
      const now = new Date().toISOString();
      await this.prisma.groupMember.upsert({
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
      });
      return this.getGroup(userId, groupId);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async leaveGroup(userId: string, groupId: string) {
    try {
      const membership = (await this.prisma.groupMember.findUnique({
        where: { groupId, userId },
        select: { role: true },
      })) as { role: 'owner' | 'admin' | 'member' } | null;
      if (!membership) return;
      if (membership.role === 'owner') throw new ForbiddenException('Transfer group ownership before leaving');
      await this.prisma.groupMember.delete({ where: { groupId, userId } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getMembers(userId: string, groupId: string, status: 'active' | 'pending') {
    try {
      const group = (await this.prisma.group.findUnique({
        where: { id: groupId },
        include: { members: { where: { userId }, select: { role: true, status: true } } },
      })) as GroupRow | null;
      if (!group) throw new NotFoundException('Group not found');
      const current = group.members?.[0];
      const canManage = current?.status === 'active' && (current.role === 'owner' || current.role === 'admin');
      if (status === 'pending' && !canManage) throw new ForbiddenException('Only group admins can view join requests');
      if (status === 'active' && group.privacy === 'closed' && current?.status !== 'active') {
        throw new ForbiddenException('Join this group to view its members');
      }
      const blockedIds = await this.moderationAccess.blockedUserIds(userId);
      const rows = (await this.prisma.groupMember.findMany({
        where: { groupId, status, ...(blockedIds.length ? { userId: { notIn: blockedIds } } : {}) },
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
        orderBy: { requestedAt: 'asc' },
        take: 200,
      })) as Array<{
        userId: string;
        role: 'owner' | 'admin' | 'member';
        status: 'active' | 'pending' | 'rejected';
        joinedAt: Date | string | null;
        user?: {
          profile?: {
            name: string | null;
            surname: string | null;
            city: string | null;
            profilePhoto: string | null;
            hideProfilePhotos: boolean | null;
            profileSearchVisible: boolean | null;
          } | null;
        } | null;
      }>;
      return rows.map((member) => ({
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
      }));
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
      const actor = (await this.prisma.groupMember.findUnique({
        where: { groupId, userId: actorUserId },
        select: { role: true, status: true },
      })) as Membership | null;
      if (!actor || actor.status !== 'active' || (actor.role !== 'owner' && actor.role !== 'admin')) {
        throw new ForbiddenException('Only group admins can manage members');
      }
      const target = (await this.prisma.groupMember.findUnique({
        where: { groupId, userId: targetUserId },
        select: { role: true, status: true },
      })) as Membership | null;
      if (!target) throw new NotFoundException('Membership not found');
      if (target.role === 'owner' || (actor.role !== 'owner' && target.role === 'admin')) {
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
      const updated = (await this.prisma.groupMember.update({
        where: { groupId, userId: targetUserId },
        data: { status, joinedAt },
      })) as { userId: string; role: string; status: string; joinedAt: Date | string | null };
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

  private async toSummary(group: GroupRow, includeUpdatedAt = false) {
    const membership = group.members?.[0] ?? null;
    const canManage = membership?.status === 'active' && (membership.role === 'owner' || membership.role === 'admin');
    const pendingRequestCount =
      includeUpdatedAt && canManage
        ? await this.prisma.groupMember.count({ where: { groupId: group.id, status: 'pending' } })
        : 0;
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      sports: group.sports,
      privacy: group.privacy,
      locationName: group.locationName,
      createdAt: group.createdAt,
      ...(includeUpdatedAt ? { updatedAt: group.updatedAt } : {}),
      createdByUserId: group.createdByUserId,
      memberCount: group._count?.members ?? 0,
      currentMembership: membership ? { role: membership.role, status: membership.status } : null,
      canManage,
      pendingRequestCount,
    };
  }
}
