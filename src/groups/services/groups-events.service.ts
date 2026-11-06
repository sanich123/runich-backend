import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { handleServiceError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ModerationAccessService } from 'src/moderation/services/moderation-access.service';
import type { CreateGroupEventDto } from '../dto/groups-content.dto';
import type { GroupEventListItem, Membership } from '../shared/groups.types';
import { createGroupPage, encodeGroupDateCursor } from '../shared/groups.pagination';
import type { GroupDateCursor } from '../shared/groups.pagination';
import { GroupsNotificationsService } from './groups-notifications.service';

@Injectable()
export class GroupsEventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModerationAccessService) private readonly moderationAccess: ModerationAccessService,
    @Inject(GroupsNotificationsService) private readonly groupNotificationsService: GroupsNotificationsService,
  ) {}
  async getEvents(
    userId: string,
    groupId: string,
    period: 'upcoming' | 'past' = 'upcoming',
    pageSize = 100,
    cursor?: GroupDateCursor,
    paginationRequested = false,
  ) {
    try {
      const group: {
        privacy: 'open' | 'closed';
        createdByUserId: string;
        members: Array<{ status: string }>;
      } | null = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: {
          privacy: true,
          createdByUserId: true,
          members: { where: { userId }, select: { status: true } },
        },
      });
      if (!group) throw new NotFoundException('Group not found');
      if (group.privacy === 'closed' && group.members[0]?.status !== 'active' && group.createdByUserId !== userId) {
        throw new ForbiddenException('Join this group to view its events');
      }
      const now = new Date();
      const cursorDateCondition = cursor
        ? {
            OR:
              period === 'upcoming'
                ? [{ startsAt: { gt: cursor.date } }, { startsAt: cursor.date, id: { gt: cursor.id } }]
                : [{ startsAt: { lt: cursor.date } }, { startsAt: cursor.date, id: { lt: cursor.id } }],
          }
        : undefined;
      const events: GroupEventListItem[] = await this.prisma.groupEvent.findMany({
        where: {
          groupId,
          startsAt: period === 'upcoming' ? { gte: now } : { lt: now },
          ...(paginationRequested && cursorDateCondition ? { AND: [cursorDateCondition] } : {}),
        },
        orderBy: period === 'upcoming' ? [{ startsAt: 'asc' }, { id: 'asc' }] : [{ startsAt: 'desc' }, { id: 'desc' }],
        take: paginationRequested ? pageSize + 1 : 100,
      });
      if (!paginationRequested) return events;
      return createGroupPage(events, pageSize, (lastEvent) =>
        encodeGroupDateCursor({ date: new Date(lastEvent.startsAt), id: lastEvent.id }),
      );
    } catch (error) {
      handleServiceError(error);
    }
  }

  async createEvent(userId: string, groupId: string, body: CreateGroupEventDto) {
    try {
      const group: { name: string; createdByUserId: string; sports: string[] } | null =
        await this.prisma.group.findUnique({
          where: { id: groupId },
          select: { name: true, createdByUserId: true, sports: true },
        });
      if (!group) throw new NotFoundException('Group not found');
      const actor: Membership | null = await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { role: true, status: true },
      });
      const hasManageRole = actor?.status === 'active' && (actor.role === 'owner' || actor.role === 'admin');
      if (group.createdByUserId !== userId && !hasManageRole) {
        throw new ForbiddenException('Only group admins can create events');
      }
      if (body.sport && !group.sports.includes(body.sport)) {
        throw new BadRequestException('Event activity must match one of the group activities');
      }
      const startsAt = new Date(body.startsAt);
      if (startsAt.getTime() <= Date.now())
        throw new BadRequestException('Group events must be scheduled in the future');
      return await this.prisma.$transaction(async (transaction) => {
        const event = await transaction.groupEvent.create({
          data: {
            groupId,
            createdByUserId: userId,
            title: body.title.trim(),
            description: body.description?.trim() || null,
            locationName: body.locationName?.trim() || null,
            sport: body.sport ?? group.sports[0] ?? null,
            distanceKm: body.distanceKm ?? null,
            startsAt,
          },
        });
        await this.groupNotificationsService.notifyGroupMembers(transaction, {
          groupId,
          groupName: group.name,
          sourceId: event.id,
          actorUserId: userId,
          isAnnouncement: true,
          kind: 'event',
          content: [event.title, event.distanceKm ? `${event.distanceKm} km` : null, event.locationName]
            .filter(Boolean)
            .join(' · '),
        });
        return event;
      });
    } catch (error) {
      handleServiceError(error);
    }
  }
}
