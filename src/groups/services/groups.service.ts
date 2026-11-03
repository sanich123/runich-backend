import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationAccessService } from 'src/moderation/services/moderation-access.service';
import { StorageService } from 'src/storage/services/storage.service';
import type { CreateGroupDto, ListGroupsQueryDto, UpdateGroupDto } from '../dto/groups.dto';
import type { GroupRow, Membership } from '../shared/groups.types';
import { GroupSummaryService } from './groups-summary.service';
import { isGroupCategory, isGroupPrivacy, isGroupSport } from '../shared/groups.utils';

@Injectable()
export class GroupsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModerationAccessService) private readonly moderationAccess: ModerationAccessService,
    @Inject(StorageService) private readonly storage: StorageService | undefined,
    @Inject(GroupSummaryService) private readonly groupSummaryService: GroupSummaryService,
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
          ...(query.scope === 'mine'
            ? {}
            : {
                members: {
                  where: { userId },
                  select: { role: true, status: true, notificationPreference: true, feedPreference: true },
                },
              }),
          photoAsset: { select: { status: true, publishedKey: true, blurhash: true } },
          _count: { select: { members: { where: { status: 'active' } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      const membershipRows: Array<{ groupId: string } & Membership> =
        query.scope === 'mine' && groups.length
          ? ((await this.prisma.groupMember.findMany({
              where: { userId, groupId: { in: groups.map(({ id }) => id) } },
              select: {
                groupId: true,
                role: true,
                status: true,
                notificationPreference: true,
                feedPreference: true,
              },
            })) ?? [])
          : [];
      const membershipByGroupId = new Map<string, Membership>(
        membershipRows.map(({ groupId, ...membership }) => [groupId, membership]),
      );
      return await Promise.all(
        groups.map((group) =>
          this.groupSummaryService.toSummary(
            group,
            userId,
            false,
            query.scope === 'mine' ? (membershipByGroupId.get(group.id) ?? null) : (group.members?.[0] ?? null),
          ),
        ),
      );
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
      return this.groupSummaryService.getGroup(userId, group.id);
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
      return this.groupSummaryService.getGroup(userId, groupId);
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
}
