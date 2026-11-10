import { jest } from '@jest/globals';
import { asyncMock, transactionMock } from 'src/tests/helpers';
import { GroupsEventsService } from '../services/groups-events.service';
import { GroupsMembersService } from '../services/groups-members.service';
import { GroupsNotificationsService } from '../services/groups-notifications.service';
import { GroupsPostsService } from '../services/groups-posts.service';
import { GroupsStatisticsService } from '../services/groups-statistics.service';
import { GroupSummaryService } from '../services/groups-summary.service';
import { GroupsService } from '../services/groups.service';

export function createPrismaMock() {
  const transaction = {
    groupMember: { findMany: asyncMock() },
    groupPost: { create: asyncMock() },
    groupEvent: { create: asyncMock() },
    profile: { findUnique: asyncMock() },
    emailNotificationJob: { create: asyncMock() },
    notification: { create: asyncMock() },
    pushNotificationJob: { create: asyncMock() },
  };
  transaction.groupMember.findMany.mockResolvedValue([]);

  return {
    $queryRaw: jest.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>>(),
    $transaction: transactionMock(transaction),
    group: {
      create: asyncMock(),
      delete: asyncMock(),
      findMany: asyncMock(),
      findUnique: asyncMock(),
      update: asyncMock(),
    },
    groupMember: {
      count: asyncMock(),
      create: asyncMock(),
      delete: asyncMock(),
      findMany: asyncMock(),
      findUnique: asyncMock(),
      update: asyncMock(),
      upsert: asyncMock(),
    },
    groupPost: { ...transaction.groupPost, findMany: asyncMock() },
    groupEvent: { ...transaction.groupEvent, findMany: asyncMock() },
    emailNotificationJob: { ...transaction.emailNotificationJob, upsert: asyncMock() },
    mediaModerationAsset: { findFirst: asyncMock() },
    transaction,
  };
}

export function createModerationAccessMock() {
  return {
    areBlocked: asyncMock().mockResolvedValue(false),
    blockedUserIds: asyncMock().mockResolvedValue([]),
  };
}

export function createGroupsServices(
  prisma: ReturnType<typeof createPrismaMock>,
  moderationAccess: ReturnType<typeof createModerationAccessMock>,
  storage?: object,
) {
  const groupSummaryService = new GroupSummaryService(prisma as never, moderationAccess as never, storage as never);
  const groupNotificationsService = new GroupsNotificationsService();
  return {
    groups: new GroupsService(prisma as never, moderationAccess as never, storage as never, groupSummaryService),
    summary: groupSummaryService,
    members: new GroupsMembersService(prisma as never, moderationAccess as never, groupSummaryService),
    statistics: new GroupsStatisticsService(prisma as never, moderationAccess as never),
    posts: new GroupsPostsService(
      prisma as never,
      moderationAccess as never,
      storage as never,
      groupNotificationsService,
    ),
    events: new GroupsEventsService(prisma as never, moderationAccess as never, groupNotificationsService),
  };
}

export const groupRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'group-1',
  name: 'Morning runners',
  description: 'Meet on Saturdays',
  sports: ['run'],
  categoryTags: [],
  privacy: 'open',
  locationName: 'Moscow',
  photoAssetId: null,
  photoAsset: null,
  createdAt: '2026-10-29T10:00:00.000Z',
  updatedAt: '2026-10-29T10:00:00.000Z',
  createdByUserId: 'owner-1',
  moderationStatus: 'visible',
  members: [],
  _count: { members: 1 },
  ...overrides,
});
