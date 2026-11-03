import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { encodeGroupDistanceCursor } from '../shared/groups.pagination';
import { createGroupsServices, createModerationAccessMock, createPrismaMock } from './fixtures';

function createGroupsService(
  prisma: ReturnType<typeof createPrismaMock>,
  moderationAccess: ReturnType<typeof createModerationAccessMock>,
  storage?: object,
) {
  return createGroupsServices(prisma, moderationAccess, storage).statistics;
}

describe('GroupsStatisticsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let moderationAccess: ReturnType<typeof createModerationAccessMock>;
  let service: ReturnType<typeof createGroupsServices>['statistics'];

  beforeEach(() => {
    prisma = createPrismaMock();
    moderationAccess = createModerationAccessMock();
    service = createGroupsService(prisma, moderationAccess);
  });

  it('returns a public monthly distance leaderboard and excludes members who hide their statistics', async () => {
    moderationAccess.blockedUserIds.mockResolvedValue(['blocked-user']);
    prisma.group.findUnique.mockResolvedValue({ id: 'group-1', privacy: 'open', members: [] });
    prisma.$queryRaw.mockResolvedValue([
      {
        userId: 'runner-1',
        name: 'Fast',
        surname: 'Runner',
        city: 'Moscow',
        profilePhoto: 'photo-url',
        totalDistance: 12500,
      },
    ]);

    const result = await service.getMonthlyLeaderboard('viewer-1', 'group-1', 2026, 9, 'UTC');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [query, ...parameters] = prisma.$queryRaw.mock.calls[0]!;
    expect(query.join('')).toContain('hide_activity_statistics');
    expect(query.join('')).toContain('HAVING COALESCE(SUM(a."distance"), 0) > 0');
    expect(query.join('')).toContain('a."route_storage_key" IS NOT NULL');
    expect(query.join('')).toContain('a."route_point_count" > 1');
    expect(parameters).toContainEqual(['blocked-user']);
    expect(result).toMatchObject({
      year: 2026,
      month: 9,
      items: [{ userId: 'runner-1', totalDistance: 12500, profile: { name: 'Fast', city: 'Moscow' } }],
    });
  });

  it('uses local calendar defaults and handles members without a visible profile', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      privacy: 'closed',
      members: [{ status: 'active' }],
    });
    prisma.$queryRaw.mockResolvedValue([
      { userId: 'runner-2', name: null, surname: null, city: null, profilePhoto: null, totalDistance: '7500' },
    ]);

    const result = await service.getMonthlyLeaderboard('member-1', 'group-1');

    expect(result).toMatchObject({
      year: expect.any(Number),
      month: expect.any(Number),
      timeZone: expect.any(String),
      items: [{ userId: 'runner-2', profile: null, totalDistance: 7500 }],
    });
  });

  it('paginates the monthly leaderboard with a stable distance and user cursor', async () => {
    const cursor = { totalDistance: 10000, userId: 'runner-0' };
    prisma.group.findUnique.mockResolvedValue({ id: 'group-1', privacy: 'open', members: [] });
    prisma.$queryRaw.mockResolvedValue([
      { userId: 'runner-1', name: 'Fast', surname: null, city: null, profilePhoto: null, totalDistance: 12000 },
      { userId: 'runner-2', name: null, surname: null, city: null, profilePhoto: null, totalDistance: 11000 },
    ]);

    const page = await service.getMonthlyLeaderboard('viewer-1', 'group-1', 2026, 9, 'UTC', 1, cursor, true);

    const rawQuery = prisma.$queryRaw.mock.calls[0]![0];
    expect(rawQuery.join('')).toContain('ORDER BY "totalDistance" DESC, gm."user_id" ASC');
    expect(prisma.$queryRaw.mock.calls[0]!.slice(1)).toContain(cursor.totalDistance);
    expect(prisma.$queryRaw.mock.calls[0]!.slice(1)).toContain(cursor.userId);
    expect(page).toMatchObject({
      year: 2026,
      month: 9,
      items: [{ userId: 'runner-1', totalDistance: 12000 }],
      hasMore: true,
      nextCursor: encodeGroupDistanceCursor({ totalDistance: 12000, userId: 'runner-1' }),
    });

    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(
      service.getMonthlyLeaderboard('viewer-1', 'group-1', 2026, 9, 'UTC', 1, cursor, true),
    ).resolves.toMatchObject({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('requires membership to view the monthly leaderboard for a closed group', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 'group-1', privacy: 'closed', members: [] });

    await expect(service.getMonthlyLeaderboard('visitor-1', 'group-1', 2026, 9, 'UTC')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.groupMember.findMany).not.toHaveBeenCalled();
  });

  it('returns not found for missing group statistics', async () => {
    prisma.group.findUnique.mockResolvedValue(null);
    await expect(service.getMonthlyLeaderboard('visitor-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
