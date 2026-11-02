import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationAccessService } from 'src/moderation/moderation-access.service';
import { ActivityMetricsService } from 'src/statistic/activity-metrics.service';
import { DEFAULT_TIME_ZONE, getLocalDateParts } from 'src/common/utils/time-zone';
import { StorageService } from 'src/storage/services/storage.service';
import { EMAIL_NOTIFICATION_JOB_STATUS, EMAIL_NOTIFICATION_TYPE } from 'src/email/email-notification.constants';
import type {
  CreateGroupDto,
  CreateGroupEventDto,
  CreateGroupPostDto,
  ListGroupsQueryDto,
  UpdateGroupDto,
  UpdateGroupPreferencesDto,
} from './groups.dto';
import { GROUP_CATEGORIES, GROUP_PRIVACY_VALUES, GROUP_SPORTS } from './groups.dto';

type Membership = {
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'rejected';
  notificationPreference?: 'all' | 'announcements' | 'off';
  feedPreference?: 'all' | 'admins';
};
type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  sports: string[];
  categoryTags?: string[];
  photoAssetId?: string | null;
  photoAsset?: { status: string; publishedKey: string | null } | null;
  moderationStatus?: 'visible' | 'hidden' | 'removed';
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
  private readonly activityMetrics = new ActivityMetricsService();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModerationAccessService) private readonly moderationAccess: ModerationAccessService,
    @Inject(StorageService) private readonly storage?: StorageService,
  ) {}

  async getGroups(userId: string, query: ListGroupsQueryDto) {
    try {
      const where: Record<string, unknown> = { moderationStatus: 'visible' };
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
          members: {
            where: { userId },
            select: { role: true, status: true, notificationPreference: true, feedPreference: true },
          },
          photoAsset: { select: { status: true, publishedKey: true } },
          _count: { select: { members: { where: { status: 'active' } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })) as GroupRow[];
      return await Promise.all(groups.map((group) => this.toSummary(group, userId)));
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createGroup(userId: string, body: CreateGroupDto) {
    try {
      const name = body.name.trim();
      if (name.length < 2) throw new BadRequestException('Group name must contain at least two characters');
      const sports = [...new Set(body.sports)];
      if (sports.length !== 1) throw new BadRequestException('Choose exactly one group activity');
      if (sports.some((sport) => !GROUP_SPORTS.includes(sport as (typeof GROUP_SPORTS)[number]))) {
        throw new ForbiddenException('Unsupported group activity');
      }
      const categoryTags = [...new Set(body.categoryTags ?? [])];
      if (
        categoryTags.length > 3 ||
        categoryTags.some((tag) => !GROUP_CATEGORIES.includes(tag as (typeof GROUP_CATEGORIES)[number]))
      ) {
        throw new BadRequestException('Choose up to three supported group categories');
      }
      if (body.photoAssetId) {
        const photo = await this.prisma.mediaModerationAsset.findFirst({
          where: { id: body.photoAssetId, ownerId: userId, scope: 'group', role: 'media' },
          select: { status: true, contentType: true },
        });
        if (!photo || !photo.contentType.startsWith('image/') || ['failed', 'rejected'].includes(photo.status)) {
          throw new BadRequestException('Group photo upload is not available');
        }
      }
      const group = (await this.prisma.group.create({
        data: {
          name,
          description: body.description?.trim() || null,
          sports,
          categoryTags,
          photoAssetId: body.photoAssetId ?? null,
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

  async updateGroup(userId: string, groupId: string, body: UpdateGroupDto) {
    try {
      const group = (await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { createdByUserId: true, photoAssetId: true },
      })) as { createdByUserId: string; photoAssetId: string | null } | null;
      if (!group) throw new NotFoundException('Group not found');
      if (group.createdByUserId !== userId) throw new ForbiddenException('Only the group owner can edit it');

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (name.length < 2) throw new BadRequestException('Group name must contain at least two characters');
        data.name = name;
      }
      if (body.description !== undefined) {
        if (body.description !== null && typeof body.description !== 'string') {
          throw new BadRequestException('Group description must be text');
        }
        data.description = typeof body.description === 'string' ? body.description.trim() || null : null;
      }
      if (body.sports !== undefined) {
        const sports = Array.isArray(body.sports) ? [...new Set(body.sports)] : [];
        if (sports.length !== 1) throw new BadRequestException('Choose exactly one group activity');
        if (sports.some((sport) => !GROUP_SPORTS.includes(sport as (typeof GROUP_SPORTS)[number]))) {
          throw new ForbiddenException('Unsupported group activity');
        }
        data.sports = sports;
      }
      if (body.categoryTags !== undefined) {
        const categoryTags = Array.isArray(body.categoryTags) ? [...new Set(body.categoryTags)] : [];
        if (
          categoryTags.length > 3 ||
          categoryTags.some((tag) => !GROUP_CATEGORIES.includes(tag as (typeof GROUP_CATEGORIES)[number]))
        ) {
          throw new BadRequestException('Choose up to three supported group categories');
        }
        data.categoryTags = categoryTags;
      }
      if (body.privacy !== undefined) {
        if (!GROUP_PRIVACY_VALUES.includes(body.privacy as (typeof GROUP_PRIVACY_VALUES)[number])) {
          throw new BadRequestException('Choose a supported group privacy');
        }
        data.privacy = body.privacy;
      }
      if (body.locationName !== undefined) {
        if (body.locationName !== null && typeof body.locationName !== 'string') {
          throw new BadRequestException('Group location must be text');
        }
        data.locationName = typeof body.locationName === 'string' ? body.locationName.trim() || null : null;
      }

      let nextPhotoAssetId = group.photoAssetId;
      if (body.photoAssetId !== undefined) {
        if (body.photoAssetId === null) {
          nextPhotoAssetId = null;
        } else {
          if (typeof body.photoAssetId !== 'string')
            throw new BadRequestException('Group photo upload is not available');
          const photo = await this.prisma.mediaModerationAsset.findFirst({
            where: { id: body.photoAssetId, ownerId: userId, scope: 'group', role: 'media' },
            select: { status: true, contentType: true },
          });
          if (!photo || !photo.contentType.startsWith('image/') || ['failed', 'rejected'].includes(photo.status)) {
            throw new BadRequestException('Group photo upload is not available');
          }
          nextPhotoAssetId = body.photoAssetId;
        }
        data.photoAssetId = nextPhotoAssetId;
      }

      if (!Object.keys(data).length) throw new BadRequestException('Provide at least one group field to update');
      await this.prisma.group.update({ where: { id: groupId }, data });
      if (body.photoAssetId !== undefined && group.photoAssetId !== nextPhotoAssetId && this.storage) {
        await this.storage.deleteGroupPhotoAsset(userId, group.photoAssetId).catch(() => undefined);
      }
      return this.getGroup(userId, groupId);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getGroup(userId: string, groupId: string) {
    try {
      const group = (await this.prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: {
            where: { userId },
            select: { role: true, status: true, notificationPreference: true, feedPreference: true },
          },
          photoAsset: { select: { status: true, publishedKey: true } },
          _count: { select: { members: { where: { status: 'active' } } } },
        },
      })) as GroupRow | null;
      if (!group || group.moderationStatus !== 'visible') throw new NotFoundException('Group not found');
      if (await this.moderationAccess.areBlocked(userId, group.createdByUserId)) {
        throw new ForbiddenException('This group is unavailable');
      }
      return await this.toSummary(group, userId, true);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteGroup(userId: string, groupId: string) {
    try {
      const group = (await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { createdByUserId: true, photoAssetId: true },
      })) as { createdByUserId: string; photoAssetId: string | null } | null;
      if (!group) throw new NotFoundException('Group not found');
      if (group.createdByUserId !== userId) throw new ForbiddenException('Only the group owner can delete it');
      await this.prisma.group.delete({ where: { id: groupId } });
      if (this.storage) await this.storage.deleteGroupPhotoAsset(userId, group.photoAssetId).catch(() => undefined);
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

  async getMonthlyLeaderboard(
    userId: string,
    groupId: string,
    year?: number,
    month?: number,
    timeZone = DEFAULT_TIME_ZONE,
  ) {
    try {
      const group = (await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, privacy: true, members: { where: { userId }, select: { status: true } } },
      })) as { id: string; privacy: 'open' | 'closed'; members: Array<{ status: string }> } | null;
      if (!group) throw new NotFoundException('Group not found');
      if (group.privacy === 'closed' && group.members[0]?.status !== 'active') {
        throw new ForbiddenException('Join this group to view member statistics');
      }

      const currentLocalDate = getLocalDateParts(new Date(), timeZone);
      const selectedYear = year ?? currentLocalDate.year;
      const selectedMonth = month ?? currentLocalDate.month - 1;
      const { gte, lt } = this.activityMetrics.localMonthRange(selectedYear, selectedMonth, timeZone);
      const blockedIds = await this.moderationAccess.blockedUserIds(userId);
      const rows = await this.prisma.$queryRaw<
        Array<{
          userId: string;
          name: string | null;
          surname: string | null;
          city: string | null;
          profilePhoto: string | null;
          totalDistance: number;
        }>
      >`
        SELECT
          gm."user_id"::text AS "userId",
          p."name" AS "name",
          p."surname" AS "surname",
          CASE WHEN p."profile_search_visible" IS TRUE THEN p."city" ELSE NULL END AS "city",
          CASE WHEN p."hide_profile_photos" IS TRUE THEN NULL ELSE p."profilePhoto" END AS "profilePhoto",
          COALESCE(SUM(a."distance"), 0)::double precision AS "totalDistance"
        FROM "GroupMember" gm
        LEFT JOIN "Profile" p ON p."user_id" = gm."user_id"
        LEFT JOIN "Activity" a
          ON a."user_id" = gm."user_id"
          AND a."date" >= ${gte}::timestamptz
          AND a."date" < ${lt}::timestamptz
          AND a."visibility" = 'public'
          AND a."moderation_status" = 'visible'
        WHERE gm."group_id" = ${groupId}::uuid
          AND gm."status" = 'active'
          AND p."hide_activity_statistics" IS DISTINCT FROM TRUE
          AND NOT (gm."user_id" = ANY(${blockedIds}::uuid[]))
        GROUP BY gm."user_id", p."name", p."surname", p."city", p."profilePhoto", p."profile_search_visible", p."hide_profile_photos"
        HAVING COALESCE(SUM(a."distance"), 0) > 0
        ORDER BY "totalDistance" DESC, gm."user_id"
        LIMIT 100
      `;
      const items = rows.map((row) => ({
        userId: row.userId,
        profile:
          row.name || row.surname || row.city || row.profilePhoto
            ? { name: row.name, surname: row.surname, city: row.city, profilePhoto: row.profilePhoto }
            : null,
        totalDistance: Number(row.totalDistance),
      }));

      return { year: selectedYear, month: selectedMonth, timeZone, items };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getPosts(userId: string, groupId: string) {
    try {
      const group = (await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { privacy: true, members: { where: { userId }, select: { status: true, feedPreference: true } } },
      })) as {
        privacy: 'open' | 'closed';
        members: Array<{ status: string; feedPreference: 'all' | 'admins' }>;
      } | null;
      if (!group) throw new NotFoundException('Group not found');
      const membership = group.members[0];
      if (group.privacy === 'closed' && membership?.status !== 'active') {
        throw new ForbiddenException('Join this group to view its posts');
      }

      const blockedIds = await this.moderationAccess.blockedUserIds(userId);
      const where: Record<string, unknown> = {
        groupId,
        ...(blockedIds.length ? { createdByUserId: { notIn: blockedIds } } : {}),
      };
      if (membership?.status === 'active' && membership.feedPreference === 'admins') {
        const admins = (await this.prisma.groupMember.findMany({
          where: { groupId, status: 'active', role: { in: ['owner', 'admin'] } },
          select: { userId: true },
        })) as Array<{ userId: string }>;
        const adminIds = admins
          .map(({ userId: adminId }) => adminId)
          .filter((adminId) => !blockedIds.includes(adminId));
        if (!adminIds.length) return [];
        where.createdByUserId = { in: adminIds };
      }

      const posts = (await this.prisma.groupPost.findMany({
        where,
        include: {
          author: {
            include: {
              profile: { select: { name: true, surname: true, profilePhoto: true, hideProfilePhotos: true } },
            },
          },
          photoAsset: { select: { status: true, publishedKey: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })) as Array<{
        id: string;
        text: string;
        createdAt: Date | string;
        author?: {
          id: string;
          profile?: {
            name: string | null;
            surname: string | null;
            profilePhoto: string | null;
            hideProfilePhotos: boolean | null;
          } | null;
        } | null;
        photoAsset?: { status: string; publishedKey: string | null } | null;
      }>;
      return posts.map((post) => ({
        id: post.id,
        text: post.text,
        createdAt: post.createdAt,
        author: post.author?.profile
          ? {
              userId: post.author.id,
              name: [post.author.profile.name, post.author.profile.surname].filter(Boolean).join(' ') || null,
              profilePhoto: post.author.profile.hideProfilePhotos ? null : post.author.profile.profilePhoto,
            }
          : null,
        photoUrl:
          post.photoAsset?.status === 'approved' && post.photoAsset.publishedKey && this.storage
            ? this.storage.getPublicUrl(post.photoAsset.publishedKey)
            : null,
      }));
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createPost(userId: string, groupId: string, body: CreateGroupPostDto) {
    try {
      const membership = (await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { status: true },
      })) as { status: string } | null;
      if (membership?.status !== 'active') throw new ForbiddenException('Only active group members can publish posts');
      const text = body.text.trim();
      if (!text) throw new BadRequestException('Post text is required');
      if (body.photoAssetId) {
        const photo = await this.prisma.mediaModerationAsset.findFirst({
          where: { id: body.photoAssetId, ownerId: userId, scope: 'group', role: 'media' },
          select: { status: true, contentType: true },
        });
        if (!photo || !photo.contentType.startsWith('image/') || ['failed', 'rejected'].includes(photo.status)) {
          throw new BadRequestException('Group post photo upload is not available');
        }
      }
      return await this.prisma.groupPost.create({
        data: { groupId, createdByUserId: userId, text, photoAssetId: body.photoAssetId ?? null },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getEvents(userId: string, groupId: string, period: 'upcoming' | 'past' = 'upcoming') {
    try {
      const group = (await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { privacy: true, members: { where: { userId }, select: { status: true } } },
      })) as { privacy: 'open' | 'closed'; members: Array<{ status: string }> } | null;
      if (!group) throw new NotFoundException('Group not found');
      if (group.privacy === 'closed' && group.members[0]?.status !== 'active') {
        throw new ForbiddenException('Join this group to view its events');
      }
      const now = new Date();
      return await this.prisma.groupEvent.findMany({
        where: { groupId, startsAt: period === 'upcoming' ? { gte: now } : { lt: now } },
        orderBy: { startsAt: period === 'upcoming' ? 'asc' : 'desc' },
        take: 100,
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createEvent(userId: string, groupId: string, body: CreateGroupEventDto) {
    try {
      const actor = (await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { role: true, status: true },
      })) as Membership | null;
      if (!actor || actor.status !== 'active' || (actor.role !== 'owner' && actor.role !== 'admin')) {
        throw new ForbiddenException('Only group admins can create events');
      }
      const startsAt = new Date(body.startsAt);
      if (startsAt.getTime() <= Date.now())
        throw new BadRequestException('Group events must be scheduled in the future');
      return await this.prisma.groupEvent.create({
        data: {
          groupId,
          createdByUserId: userId,
          title: body.title.trim(),
          description: body.description?.trim() || null,
          locationName: body.locationName?.trim() || null,
          startsAt,
        },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }

  private async toSummary(group: GroupRow, userId: string, includeUpdatedAt = false) {
    const membership = group.members?.[0] ?? null;
    const isOwner = group.createdByUserId === userId;
    const photoPreviewUrl =
      isOwner && group.photoAsset?.status !== 'approved' && this.storage
        ? await this.storage.getOwnerModerationPreviewUrl(userId, group.photoAssetId)
        : null;
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
      isOwner,
      memberCount: group._count?.members ?? 0,
      categoryTags: group.categoryTags ?? [],
      photoUrl:
        group.photoAsset?.status === 'approved' && group.photoAsset.publishedKey && this.storage
          ? this.storage.getPublicUrl(group.photoAsset.publishedKey)
          : null,
      photoPreviewUrl,
      photoPending: ['queued', 'processing'].includes(group.photoAsset?.status ?? ''),
      currentMembership: membership
        ? {
            role: membership.role,
            status: membership.status,
            notificationPreference: membership.notificationPreference ?? 'all',
            feedPreference: membership.feedPreference ?? 'all',
          }
        : null,
      canManage,
      pendingRequestCount,
    };
  }
}
