import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { asyncMock } from 'src/tests/helpers';
import { GroupsService } from '../groups.service';

function createPrismaMock() {
  return {
    $queryRaw: asyncMock(),
    group: {
      create: asyncMock(),
      findMany: asyncMock(),
      findUnique: asyncMock(),
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
    groupPost: { create: asyncMock(), findMany: asyncMock() },
    groupEvent: { create: asyncMock(), findMany: asyncMock() },
    mediaModerationAsset: { findFirst: asyncMock() },
  };
}

const groupRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'group-1',
  name: 'Morning runners',
  description: 'Meet on Saturdays',
  sports: ['run'],
  categoryTags: [],
  privacy: 'open',
  locationName: 'Moscow',
  createdAt: '2026-10-29T10:00:00.000Z',
  updatedAt: '2026-10-29T10:00:00.000Z',
  createdByUserId: 'owner-1',
  members: [],
  _count: { members: 1 },
  ...overrides,
});

describe('GroupsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let moderationAccess: { areBlocked: ReturnType<typeof asyncMock>; blockedUserIds: ReturnType<typeof asyncMock> };
  let service: GroupsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    moderationAccess = {
      areBlocked: asyncMock().mockResolvedValue(false),
      blockedUserIds: asyncMock().mockResolvedValue([]),
    };
    service = new GroupsService(prisma as never, moderationAccess as never);
  });

  it('filters group discovery by scope, search, supported sport, and blocked creators', async () => {
    moderationAccess.blockedUserIds.mockResolvedValue(['blocked-user']);
    prisma.$queryRaw.mockResolvedValue([{ id: 'group-1' }]);
    prisma.group.findMany.mockResolvedValue([groupRow()]);

    const result = await service.getGroups('member-1', { scope: 'mine', search: 'run', sport: 'run' });

    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdByUserId: { notIn: ['blocked-user'] },
          members: { some: { userId: 'member-1', status: { in: ['active', 'pending'] } } },
          id: { in: ['group-1'] },
          OR: expect.any(Array),
        }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('group-1');
  });

  it('returns no groups when no group supports the selected sport', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.getGroups('member-1', { scope: 'all', sport: 'walk' })).resolves.toEqual([]);
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });

  it('creates a group and adds its creator as the owner', async () => {
    prisma.group.create.mockResolvedValue({ id: 'group-1' });
    prisma.group.findUnique.mockResolvedValue(
      groupRow({
        members: [{ role: 'owner', status: 'active' }],
      }),
    );
    prisma.groupMember.count.mockResolvedValue(0);

    await service.createGroup('owner-1', {
      name: ' Morning runners ',
      description: ' Saturdays ',
      sports: ['run', 'walk', 'run'],
      privacy: 'closed',
      locationName: ' Moscow ',
    });

    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Morning runners',
          description: 'Saturdays',
          sports: ['run', 'walk'],
          privacy: 'closed',
          locationName: 'Moscow',
          members: { create: expect.objectContaining({ userId: 'owner-1', role: 'owner', status: 'active' }) },
        }),
      }),
    );
  });

  it('attaches a moderated group photo and category tags when creating a group', async () => {
    prisma.mediaModerationAsset.findFirst.mockResolvedValue({
      status: 'queued',
      contentType: 'image/webp',
    });
    prisma.group.create.mockResolvedValue({ id: 'group-1' });
    prisma.group.findUnique.mockResolvedValue(groupRow({ members: [{ role: 'owner', status: 'active' }] }));
    prisma.groupMember.count.mockResolvedValue(0);

    await service.createGroup('owner-1', {
      name: 'City team',
      sports: ['run', 'hike'],
      categoryTags: ['team', 'local'],
      photoAssetId: 'photo-asset-1',
      privacy: 'open',
    });

    expect(prisma.mediaModerationAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'photo-asset-1', ownerId: 'owner-1', scope: 'group', role: 'media' } }),
    );
    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryTags: ['team', 'local'], photoAssetId: 'photo-asset-1' }),
      }),
    );
  });

  it('rejects a group photo that is missing, non-image, or rejected', async () => {
    prisma.mediaModerationAsset.findFirst.mockResolvedValue(null);
    await expect(
      service.createGroup('owner-1', {
        name: 'City team',
        sports: ['run'],
        photoAssetId: 'missing-asset',
        privacy: 'open',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.group.create).not.toHaveBeenCalled();
  });

  it('stores blank optional group fields as null', async () => {
    prisma.group.create.mockResolvedValue({ id: 'group-1' });
    prisma.group.findUnique.mockResolvedValue(groupRow({ members: [{ role: 'owner', status: 'active' }] }));
    prisma.groupMember.count.mockResolvedValue(0);

    await service.createGroup('owner-1', {
      name: 'Trail club',
      description: '   ',
      sports: ['hike'],
      privacy: 'open',
      locationName: '   ',
    });

    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: null, locationName: null }),
      }),
    );
  });

  it('rejects blank names and unsupported sports', async () => {
    await expect(
      service.createGroup('owner-1', { name: '  ', sports: ['run'], privacy: 'open' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createGroup('owner-1', { name: 'Group', sports: ['unsupportedSport' as 'run'], privacy: 'open' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects missing groups and adds a member directly to an open group', async () => {
    prisma.group.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'group-1', privacy: 'open', createdByUserId: 'owner-1' })
      .mockResolvedValueOnce(groupRow({ members: [{ role: 'member', status: 'active' }] }));
    prisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(service.joinGroup('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    const result = await service.joinGroup('user-1', 'group-1');

    expect(prisma.groupMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'active', joinedAt: expect.any(String) }),
      }),
    );
    expect(result).toMatchObject({ currentMembership: { status: 'active' } });
  });

  it('returns group state and rejects inaccessible groups', async () => {
    prisma.group.findUnique.mockResolvedValueOnce(null);
    await expect(service.getGroup('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);

    prisma.group.findUnique.mockResolvedValue(groupRow());
    moderationAccess.areBlocked.mockResolvedValue(true);
    await expect(service.getGroup('user-1', 'group-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sends a request to closed groups and does not demote existing members on repeated joins', async () => {
    prisma.group.findUnique
      .mockResolvedValueOnce({ id: 'group-1', privacy: 'closed', createdByUserId: 'owner-1' })
      .mockResolvedValueOnce(groupRow({ privacy: 'closed', members: [{ role: 'member', status: 'pending' }] }));
    prisma.groupMember.findUnique.mockResolvedValue(null);
    prisma.groupMember.upsert.mockResolvedValue({});
    prisma.groupMember.count.mockResolvedValue(0);

    const result = await service.joinGroup('user-1', 'group-1');

    expect(prisma.groupMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'pending', userId: 'user-1' }),
      }),
    );
    expect(result).toMatchObject({ currentMembership: { status: 'pending' } });

    prisma.group.findUnique.mockResolvedValue({ id: 'group-1', privacy: 'closed', createdByUserId: 'owner-1' });
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'active' });
    await service.joinGroup('user-1', 'group-1');
    expect(prisma.groupMember.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects joining a group whose creator blocked the requester', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 'group-1', privacy: 'open', createdByUserId: 'owner-1' });
    moderationAccess.areBlocked.mockResolvedValue(true);

    await expect(service.joinGroup('user-1', 'group-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.groupMember.upsert).not.toHaveBeenCalled();
  });

  it('protects ownership on leave and deletes regular memberships', async () => {
    prisma.groupMember.findUnique.mockResolvedValueOnce(null);
    await expect(service.leaveGroup('user-1', 'group-1')).resolves.toBeUndefined();

    prisma.groupMember.findUnique.mockResolvedValueOnce({ role: 'owner' });
    await expect(service.leaveGroup('owner-1', 'group-1')).rejects.toBeInstanceOf(ForbiddenException);

    prisma.groupMember.findUnique.mockResolvedValueOnce({ role: 'member' });
    await service.leaveGroup('member-1', 'group-1');
    expect(prisma.groupMember.delete).toHaveBeenCalledWith({ where: { groupId: 'group-1', userId: 'member-1' } });
  });

  it('limits member lists and honors profile visibility settings', async () => {
    prisma.group.findUnique.mockResolvedValue(groupRow());
    moderationAccess.blockedUserIds.mockResolvedValue(['blocked-user']);
    prisma.groupMember.findMany.mockResolvedValue([
      {
        userId: 'member-1',
        role: 'member',
        status: 'active',
        joinedAt: '2026-10-29T10:00:00.000Z',
        user: {
          profile: {
            name: 'Alex',
            surname: 'Runner',
            city: 'Moscow',
            profilePhoto: 'photo-url',
            hideProfilePhotos: true,
            profileSearchVisible: false,
          },
        },
      },
    ]);

    const members = await service.getMembers('owner-1', 'group-1', 'active');

    expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'group-1', status: 'active', userId: { notIn: ['blocked-user'] } },
      }),
    );
    expect(members[0].profile).toEqual({ name: 'Alex', surname: 'Runner', city: null, profilePhoto: null });
  });

  it('allows active closed-group members to view the roster with visible profile fields', async () => {
    prisma.group.findUnique.mockResolvedValue(
      groupRow({
        privacy: 'closed',
        members: [{ role: 'member', status: 'active' }],
      }),
    );
    prisma.groupMember.findMany.mockResolvedValue([
      {
        userId: 'member-1',
        role: 'member',
        status: 'active',
        joinedAt: '2026-10-29T10:00:00.000Z',
        user: {
          profile: {
            name: 'Alex',
            surname: 'Runner',
            city: 'Moscow',
            profilePhoto: 'photo-url',
            hideProfilePhotos: false,
            profileSearchVisible: true,
          },
        },
      },
      { userId: 'member-2', role: 'member', status: 'active', joinedAt: null, user: null },
    ]);

    const members = await service.getMembers('member-1', 'group-1', 'active');

    expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'group-1', status: 'active' },
      }),
    );
    expect(members.map(({ profile }) => profile)).toEqual([
      { name: 'Alex', surname: 'Runner', city: 'Moscow', profilePhoto: 'photo-url' },
      null,
    ]);
  });

  it('lets active admins view pending requests and rejects missing groups', async () => {
    prisma.group.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(groupRow({ members: [{ role: 'admin', status: 'active' }] }));
    prisma.groupMember.findMany.mockResolvedValue([]);

    await expect(service.getMembers('admin-1', 'missing', 'active')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getMembers('admin-1', 'group-1', 'pending')).resolves.toEqual([]);
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'group-1', status: 'pending' },
      }),
    );
  });

  it('does not expose closed-group members or pending requests to non-admins', async () => {
    prisma.group.findUnique.mockResolvedValue(groupRow({ privacy: 'closed' }));
    await expect(service.getMembers('visitor-1', 'group-1', 'active')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getMembers('visitor-1', 'group-1', 'pending')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.groupMember.findMany).not.toHaveBeenCalled();
  });

  it('allows admins to approve requests and prevents them from managing other admins', async () => {
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'admin', status: 'active' })
      .mockResolvedValueOnce({ role: 'member', status: 'pending' });
    prisma.groupMember.update.mockResolvedValue({
      userId: 'member-1',
      role: 'member',
      status: 'active',
      joinedAt: '2026-10-29T10:00:00.000Z',
    });

    await expect(service.updateMember('admin-1', 'group-1', 'member-1', 'active')).resolves.toMatchObject({
      status: 'active',
    });
    expect(prisma.groupMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'active', joinedAt: expect.any(String) } }),
    );

    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'admin', status: 'active' })
      .mockResolvedValueOnce({ role: 'admin', status: 'active' });
    await expect(service.updateMember('admin-1', 'group-1', 'admin-2', 'removed')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets group owners decline requests and remove active members', async () => {
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'owner', status: 'active' })
      .mockResolvedValueOnce({ role: 'member', status: 'pending' });
    prisma.groupMember.update.mockResolvedValue({
      userId: 'member-1',
      role: 'member',
      status: 'rejected',
      joinedAt: null,
    });

    await expect(service.updateMember('owner-1', 'group-1', 'member-1', 'rejected')).resolves.toMatchObject({
      status: 'rejected',
      joinedAt: null,
    });
    expect(prisma.groupMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'rejected', joinedAt: null },
      }),
    );

    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'owner', status: 'active' })
      .mockResolvedValueOnce({ role: 'member', status: 'active' });
    await expect(service.updateMember('owner-1', 'group-1', 'member-1', 'removed')).resolves.toMatchObject({
      status: 'removed',
    });
    expect(prisma.groupMember.delete).toHaveBeenCalledWith({ where: { groupId: 'group-1', userId: 'member-1' } });
  });

  it('rejects member updates without permission or for incompatible membership states', async () => {
    prisma.groupMember.findUnique.mockResolvedValueOnce(null);
    await expect(service.updateMember('visitor-1', 'group-1', 'member-1', 'active')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'owner', status: 'active' })
      .mockResolvedValueOnce(null);
    await expect(service.updateMember('owner-1', 'group-1', 'missing', 'active')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'owner', status: 'active' })
      .mockResolvedValueOnce({ role: 'member', status: 'active' });
    await expect(service.updateMember('owner-1', 'group-1', 'member-1', 'active')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'owner', status: 'active' })
      .mockResolvedValueOnce({ role: 'member', status: 'active' });
    await expect(service.updateMember('owner-1', 'group-1', 'member-1', 'rejected')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'owner', status: 'active' })
      .mockResolvedValueOnce({ role: 'member', status: 'pending' });
    await expect(service.updateMember('owner-1', 'group-1', 'member-1', 'removed')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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
    const query = prisma.$queryRaw.mock.calls[0]! as unknown as [TemplateStringsArray, ...unknown[]];
    expect(query[0].join('')).toContain('hide_activity_statistics');
    expect(query[0].join('')).toContain('HAVING COALESCE(SUM(a."distance"), 0) > 0');
    expect(query.slice(1)).toContainEqual(['blocked-user']);
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

  it('requires membership to view the monthly leaderboard for a closed group', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 'group-1', privacy: 'closed', members: [] });

    await expect(service.getMonthlyLeaderboard('visitor-1', 'group-1', 2026, 9, 'UTC')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.groupMember.findMany).not.toHaveBeenCalled();
  });

  it('saves preferences only for active group members', async () => {
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'active' });
    prisma.groupMember.update.mockResolvedValue({ notificationPreference: 'announcements', feedPreference: 'admins' });

    await expect(
      service.updatePreferences('member-1', 'group-1', {
        notificationPreference: 'announcements',
        feedPreference: 'admins',
      }),
    ).resolves.toEqual({ notificationPreference: 'announcements', feedPreference: 'admins' });
    expect(prisma.groupMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId_userId: { groupId: 'group-1', userId: 'member-1' } },
        data: { notificationPreference: 'announcements', feedPreference: 'admins' },
      }),
    );

    prisma.groupMember.findUnique.mockResolvedValue({ status: 'pending' });
    await expect(
      service.updatePreferences('member-1', 'group-1', { notificationPreference: 'off', feedPreference: 'all' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('filters group posts to admin posts when requested by an active member', async () => {
    prisma.group.findUnique.mockResolvedValue({
      privacy: 'open',
      members: [{ status: 'active', feedPreference: 'admins' }],
    });
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'admin-1' }]);
    prisma.groupPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        text: 'Sunday run',
        createdAt: '2026-10-29T10:00:00.000Z',
        author: {
          id: 'admin-1',
          profile: { name: 'Alex', surname: 'Runner', profilePhoto: 'photo-url', hideProfilePhotos: false },
        },
        photoAsset: null,
      },
    ]);

    const result = await service.getPosts('member-1', 'group-1');

    expect(prisma.groupPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 'group-1', createdByUserId: { in: ['admin-1'] } }, take: 50 }),
    );
    expect(result).toEqual([
      {
        id: 'post-1',
        text: 'Sunday run',
        createdAt: '2026-10-29T10:00:00.000Z',
        author: { userId: 'admin-1', name: 'Alex Runner', profilePhoto: 'photo-url' },
        photoUrl: null,
      },
    ]);
  });

  it('returns no posts when an admin-only feed has no visible admins', async () => {
    prisma.group.findUnique.mockResolvedValue({
      privacy: 'open',
      members: [{ status: 'active', feedPreference: 'admins' }],
    });
    prisma.groupMember.findMany.mockResolvedValue([]);

    await expect(service.getPosts('member-1', 'group-1')).resolves.toEqual([]);
    expect(prisma.groupPost.findMany).not.toHaveBeenCalled();
  });

  it('returns approved group post photos and hides missing author profiles', async () => {
    const getPublicUrl = jest.fn().mockReturnValue('https://cdn.test/group-post.webp');
    service = new GroupsService(prisma as never, moderationAccess as never, { getPublicUrl } as never);
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', members: [] });
    prisma.groupPost.findMany.mockResolvedValue([
      {
        id: 'post-2',
        text: 'Club update',
        createdAt: '2026-10-29T10:00:00.000Z',
        author: { id: 'author-1', profile: null },
        photoAsset: { status: 'approved', publishedKey: 'groups/group-1/post.webp' },
      },
    ]);

    const result = await service.getPosts('viewer-1', 'group-1');

    expect(result).toEqual([expect.objectContaining({ author: null, photoUrl: 'https://cdn.test/group-post.webp' })]);
    expect(getPublicUrl).toHaveBeenCalledWith('groups/group-1/post.webp');
  });

  it('requires active membership to publish group posts', async () => {
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'pending' });

    await expect(service.createPost('member-1', 'group-1', { text: 'Hello group' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.groupPost.create).not.toHaveBeenCalled();
  });

  it('publishes trimmed group post text for active members', async () => {
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'active' });
    prisma.groupPost.create.mockResolvedValue({ id: 'post-1', text: 'Hello group' });

    await service.createPost('member-1', 'group-1', { text: ' Hello group ' });

    expect(prisma.groupPost.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', createdByUserId: 'member-1', text: 'Hello group', photoAssetId: null },
    });
  });

  it('returns upcoming and past events using their start time', async () => {
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', members: [] });
    prisma.groupEvent.findMany.mockResolvedValue([]);

    await service.getEvents('visitor-1', 'group-1', 'upcoming');
    await service.getEvents('visitor-1', 'group-1', 'past');

    expect(prisma.groupEvent.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { groupId: 'group-1', startsAt: { gte: expect.any(Date) } },
        orderBy: { startsAt: 'asc' },
      }),
    );
    expect(prisma.groupEvent.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { groupId: 'group-1', startsAt: { lt: expect.any(Date) } },
        orderBy: { startsAt: 'desc' },
      }),
    );
  });

  it('uses the upcoming event period by default and protects closed events', async () => {
    prisma.group.findUnique
      .mockResolvedValueOnce({ privacy: 'open', members: [] })
      .mockResolvedValueOnce({ privacy: 'closed', members: [] });
    prisma.groupEvent.findMany.mockResolvedValue([]);

    await service.getEvents('visitor-1', 'group-1');
    expect(prisma.groupEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 'group-1', startsAt: { gte: expect.any(Date) } } }),
    );
    await expect(service.getEvents('visitor-1', 'group-1', 'past')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects non-admin and past group events', async () => {
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'member', status: 'active' })
      .mockResolvedValueOnce({ role: 'owner', status: 'active' });

    await expect(
      service.createEvent('member-1', 'group-1', {
        title: 'Sunday run',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createEvent('owner-1', 'group-1', { title: 'Old run', startsAt: '2020-01-01T00:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.groupEvent.create).not.toHaveBeenCalled();
  });

  it('allows admins to create a future group event', async () => {
    prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner', status: 'active' });
    prisma.groupEvent.create.mockResolvedValue({ id: 'event-1' });
    const startsAt = new Date(Date.now() + 86400000).toISOString();

    await service.createEvent('owner-1', 'group-1', { title: ' Sunday run ', startsAt, locationName: ' Park ' });

    expect(prisma.groupEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: 'group-1',
        createdByUserId: 'owner-1',
        title: 'Sunday run',
        locationName: 'Park',
        startsAt: new Date(startsAt),
      }),
    });
  });
});
