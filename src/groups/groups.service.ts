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
import { GroupsContentService } from './groups-content.service';
import type {
  GroupMemberListItem,
  GroupMemberQueryRow,
  GroupPhotoReviewStatus,
  GroupPostListItem,
  GroupRow,
  Membership,
} from './groups.types';
import { encodeGroupDateCursor, encodeGroupDistanceCursor } from './groups.pagination';
import type { GroupDateCursor, GroupDistanceCursor, GroupPage } from './groups.pagination';
import { isGroupCategory, isGroupPrivacy, isGroupSport } from './groups.utils';

@Injectable()
export class GroupsService {
  private readonly activityMetrics = new ActivityMetricsService();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModerationAccessService) private readonly moderationAccess: ModerationAccessService,
    @Inject(StorageService) private readonly storage: StorageService | undefined,
    @Inject(GroupsContentService) private readonly contentService: GroupsContentService,
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
      const groups: GroupRow[] = await this.prisma.group.findMany({
        where,
        include: {
          members: {
            where: { userId },
            select: { role: true, status: true, notificationPreference: true, feedPreference: true },
          },
          photoAsset: { select: { status: true, publishedKey: true, blurhash: true } },
          _count: { select: { members: { where: { status: 'active' } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
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
      if (sports.some((sport) => !isGroupSport(sport))) {
        throw new ForbiddenException('Unsupported group activity');
      }
      const categoryTags = [...new Set(body.categoryTags ?? [])];
      if (categoryTags.length > 3 || categoryTags.some((tag) => !isGroupCategory(tag))) {
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
      const group: Pick<GroupRow, 'id'> = await this.prisma.group.create({
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
      });
      return this.getGroup(userId, group.id);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async updateGroup(userId: string, groupId: string, body: UpdateGroupDto) {
    try {
      const group: { createdByUserId: string; photoAssetId: string | null } | null = await this.prisma.group.findUnique(
        {
          where: { id: groupId },
          select: { createdByUserId: true, photoAssetId: true },
        },
      );
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
        if (sports.some((sport) => !isGroupSport(sport))) {
          throw new ForbiddenException('Unsupported group activity');
        }
        data.sports = sports;
      }
      if (body.categoryTags !== undefined) {
        const categoryTags = Array.isArray(body.categoryTags) ? [...new Set(body.categoryTags)] : [];
        if (categoryTags.length > 3 || categoryTags.some((tag) => !isGroupCategory(tag))) {
          throw new BadRequestException('Choose up to three supported group categories');
        }
        data.categoryTags = categoryTags;
      }
      if (body.privacy !== undefined) {
        if (!isGroupPrivacy(body.privacy)) {
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
      const group: GroupRow | null = await this.prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: {
            where: { userId },
            select: { role: true, status: true, notificationPreference: true, feedPreference: true },
          },
          photoAsset: { select: { status: true, publishedKey: true, blurhash: true } },
          _count: { select: { members: { where: { status: 'active' } } } },
        },
      });
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
      const group: { createdByUserId: string; photoAssetId: string | null } | null = await this.prisma.group.findUnique(
        {
          where: { id: groupId },
          select: { createdByUserId: true, photoAssetId: true },
        },
      );
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
      const hasMore = paginationRequested && rows.length > pageSize;
      const pageRows = paginationRequested ? rows.slice(0, pageSize) : rows;
      const items = pageRows.map((member) => ({
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
      if (!paginationRequested) return items;
      const lastMember = pageRows.at(-1);
      return {
        items,
        hasMore,
        nextCursor:
          hasMore && lastMember
            ? encodeGroupDateCursor({ date: new Date(lastMember.requestedAt), id: lastMember.id })
            : null,
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

  async getMonthlyLeaderboard(
    userId: string,
    groupId: string,
    year?: number,
    month?: number,
    timeZone = DEFAULT_TIME_ZONE,
    pageSize = 100,
    cursor?: GroupDistanceCursor,
    paginationRequested = false,
  ) {
    try {
      const group: { id: string; privacy: 'open' | 'closed'; members: Array<{ status: string }> } | null =
        await this.prisma.group.findUnique({
          where: { id: groupId },
          select: { id: true, privacy: true, members: { where: { userId }, select: { status: true } } },
        });
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
          AND (
            ${cursor?.totalDistance ?? null}::double precision IS NULL
            OR COALESCE(SUM(a."distance"), 0) < ${cursor?.totalDistance ?? null}::double precision
            OR (
              COALESCE(SUM(a."distance"), 0) = ${cursor?.totalDistance ?? null}::double precision
              AND gm."user_id" > ${cursor?.userId ?? null}::uuid
            )
          )
        ORDER BY "totalDistance" DESC, gm."user_id" ASC
        LIMIT ${paginationRequested ? pageSize + 1 : 100}
      `;
      const hasMore = paginationRequested && rows.length > pageSize;
      const pageRows = paginationRequested ? rows.slice(0, pageSize) : rows;
      const items = pageRows.map((row) => ({
        userId: row.userId,
        profile:
          row.name || row.surname || row.city || row.profilePhoto
            ? { name: row.name, surname: row.surname, city: row.city, profilePhoto: row.profilePhoto }
            : null,
        totalDistance: Number(row.totalDistance),
      }));

      if (!paginationRequested) return { year: selectedYear, month: selectedMonth, timeZone, items };
      const lastMember = pageRows.at(-1);
      return {
        year: selectedYear,
        month: selectedMonth,
        timeZone,
        items,
        hasMore,
        nextCursor:
          hasMore && lastMember
            ? encodeGroupDistanceCursor({ totalDistance: Number(lastMember.totalDistance), userId: lastMember.userId })
            : null,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  getPosts(userId: string, groupId: string): Promise<GroupPostListItem[]>;
  getPosts(
    userId: string,
    groupId: string,
    pageSize: number,
    cursor?: GroupDateCursor,
    paginationRequested?: boolean,
  ): Promise<GroupPostListItem[] | GroupPage<GroupPostListItem>>;
  getPosts(
    userId: string,
    groupId: string,
    pageSize?: number,
    cursor?: GroupDateCursor,
    paginationRequested?: boolean,
  ): Promise<GroupPostListItem[] | GroupPage<GroupPostListItem>> {
    return this.contentService.getPosts(userId, groupId, pageSize, cursor, paginationRequested);
  }

  createPost(userId: string, groupId: string, body: CreateGroupPostDto) {
    return this.contentService.createPost(userId, groupId, body);
  }

  getEvents(
    userId: string,
    groupId: string,
    period?: 'upcoming' | 'past',
    pageSize?: number,
    cursor?: GroupDateCursor,
    paginationRequested?: boolean,
  ) {
    return this.contentService.getEvents(userId, groupId, period, pageSize, cursor, paginationRequested);
  }

  createEvent(userId: string, groupId: string, body: CreateGroupEventDto) {
    return this.contentService.createEvent(userId, groupId, body);
  }

  private async toSummary(group: GroupRow, userId: string, includeUpdatedAt = false) {
    const membership = group.members?.[0] ?? null;
    const isOwner = group.createdByUserId === userId;
    const photoStatus = group.photoAsset?.status;
    const photoReviewStatus: GroupPhotoReviewStatus =
      photoStatus === 'queued' ||
      photoStatus === 'processing' ||
      photoStatus === 'review_required' ||
      (photoStatus === 'approved' && !group.photoAsset?.publishedKey)
        ? photoStatus
        : null;
    const photoPreviewUrl =
      isOwner && group.photoAssetId && group.photoAsset?.status !== 'approved' && this.storage
        ? await this.storage.getOwnerModerationPreviewUrl(userId, group.photoAssetId)
        : null;
    const canManage =
      isOwner || (membership?.status === 'active' && (membership.role === 'owner' || membership.role === 'admin'));
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
      photoBlurhash: photoReviewStatus ? (group.photoAsset?.blurhash ?? null) : null,
      photoReviewStatus,
      photoPending: photoReviewStatus !== null,
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
