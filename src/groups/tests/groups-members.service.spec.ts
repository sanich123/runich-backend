import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { parseGroupDateCursor } from '../shared/groups.pagination';
import { createGroupsServices, createModerationAccessMock, createPrismaMock, groupRow } from './fixtures';

function createGroupsService(
  prisma: ReturnType<typeof createPrismaMock>,
  moderationAccess: ReturnType<typeof createModerationAccessMock>,
  storage?: object,
) {
  return createGroupsServices(prisma, moderationAccess, storage).members;
}

describe('GroupsMembersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let moderationAccess: ReturnType<typeof createModerationAccessMock>;
  let service: ReturnType<typeof createGroupsServices>['members'];

  beforeEach(() => {
    prisma = createPrismaMock();
    moderationAccess = createModerationAccessMock();
    service = createGroupsService(prisma, moderationAccess);
  });

  it('rejects missing groups and adds a member directly to an open group', async () => {
    prisma.group.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'group-1', privacy: 'open', createdByUserId: 'owner-1' })
      .mockResolvedValueOnce(groupRow({ members: [{ role: 'member', status: 'active' }] }));
    prisma.groupMember.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ role: 'member', status: 'active' });
    prisma.groupMember.upsert.mockResolvedValue({ id: 'membership-1' });

    await expect(service.joinGroup('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    const result = await service.joinGroup('user-1', 'group-1');

    expect(prisma.groupMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'active', joinedAt: expect.any(String) }),
      }),
    );
    expect(result).toMatchObject({ currentMembership: { status: 'active' } });
  });

  it('sends a request to closed groups and does not demote existing members on repeated joins', async () => {
    prisma.group.findUnique
      .mockResolvedValueOnce({ id: 'group-1', privacy: 'closed', createdByUserId: 'owner-1' })
      .mockResolvedValueOnce(groupRow({ privacy: 'closed', members: [{ role: 'member', status: 'pending' }] }));
    prisma.groupMember.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ role: 'member', status: 'pending' });
    prisma.groupMember.upsert.mockResolvedValue({ id: 'membership-1' });
    prisma.groupMember.count.mockResolvedValue(0);

    const result = await service.joinGroup('user-1', 'group-1');

    expect(prisma.groupMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'pending', userId: 'user-1' }),
      }),
    );
    expect(prisma.emailNotificationJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          notificationType_sourceId: expect.objectContaining({ sourceId: 'membership-1' }),
        },
        create: expect.objectContaining({ status: 'queued', sourceId: 'membership-1' }),
      }),
    );
    expect(result).toMatchObject({ currentMembership: { status: 'pending' } });

    prisma.group.findUnique.mockResolvedValue(
      groupRow({ privacy: 'closed', members: [{ role: 'member', status: 'active' }] }),
    );
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'active' });
    await service.joinGroup('user-1', 'group-1');
    expect(prisma.groupMember.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.emailNotificationJob.upsert).toHaveBeenCalledTimes(1);
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

  it('returns a keyset-paginated member page and an empty terminal page', async () => {
    const requestedAt = new Date('2026-10-29T10:00:00.000Z');
    const inputCursor = { date: new Date('2026-10-28T10:00:00.000Z'), id: 'member-0' };
    prisma.group.findUnique.mockResolvedValue(groupRow());
    prisma.groupMember.findMany.mockResolvedValueOnce([
      {
        id: 'member-1',
        requestedAt,
        userId: 'user-1',
        role: 'member',
        status: 'active',
        joinedAt: requestedAt,
        user: { profile: null },
      },
      { id: 'member-2', requestedAt, userId: 'user-2', role: 'member', status: 'active', joinedAt: null, user: null },
      { id: 'member-3', requestedAt, userId: 'user-3', role: 'member', status: 'active', joinedAt: null, user: null },
    ]);

    const page = await service.getMembers('visitor-1', 'group-1', 'active', 2, inputCursor, true);

    expect(prisma.groupMember.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          groupId: 'group-1',
          status: 'active',
          OR: [
            { requestedAt: { gt: inputCursor.date } },
            { requestedAt: inputCursor.date, id: { gt: inputCursor.id } },
          ],
        },
        orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
        take: 3,
      }),
    );
    expect(page).toMatchObject({ hasMore: true, items: [{ userId: 'user-1' }, { userId: 'user-2' }] });
    if (!Array.isArray(page)) {
      expect(parseGroupDateCursor(page.nextCursor ?? undefined)).toEqual({ date: requestedAt, id: 'member-2' });
    }

    prisma.groupMember.findMany.mockResolvedValueOnce([]);
    await expect(service.getMembers('visitor-1', 'group-1', 'active', 2, inputCursor, true)).resolves.toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
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
    prisma.group.findUnique.mockResolvedValueOnce({ createdByUserId: 'owner-1' });
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
});
