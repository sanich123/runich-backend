import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { encodeGroupDateCursor } from '../shared/groups.pagination';
import { createGroupsServices, createModerationAccessMock, createPrismaMock } from './fixtures';

function createGroupsService(
  prisma: ReturnType<typeof createPrismaMock>,
  moderationAccess: ReturnType<typeof createModerationAccessMock>,
  storage?: object,
) {
  return createGroupsServices(prisma, moderationAccess, storage).events;
}

describe('GroupsEventsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let moderationAccess: ReturnType<typeof createModerationAccessMock>;
  let service: ReturnType<typeof createGroupsServices>['events'];

  beforeEach(() => {
    prisma = createPrismaMock();
    moderationAccess = createModerationAccessMock();
    service = createGroupsService(prisma, moderationAccess);
  });

  it('returns upcoming and past events using their start time', async () => {
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', createdByUserId: 'owner-1', members: [] });
    prisma.groupEvent.findMany.mockResolvedValue([]);

    await service.getEvents('visitor-1', 'group-1', 'upcoming');
    await service.getEvents('visitor-1', 'group-1', 'past');

    expect(prisma.groupEvent.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { groupId: 'group-1', startsAt: { gte: expect.any(Date) } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(prisma.groupEvent.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { groupId: 'group-1', startsAt: { lt: expect.any(Date) } },
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('uses the upcoming event period by default and protects closed events', async () => {
    prisma.group.findUnique
      .mockResolvedValueOnce({ privacy: 'open', createdByUserId: 'owner-1', members: [] })
      .mockResolvedValueOnce({ privacy: 'closed', createdByUserId: 'owner-1', members: [] });
    prisma.groupEvent.findMany.mockResolvedValue([]);

    await service.getEvents('visitor-1', 'group-1');
    expect(prisma.groupEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 'group-1', startsAt: { gte: expect.any(Date) } } }),
    );
    await expect(service.getEvents('visitor-1', 'group-1', 'past')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses date and ID cursors for upcoming and past event pages', async () => {
    const cursorDate = new Date('2026-10-28T10:00:00.000Z');
    const eventDate = new Date('2026-10-29T10:00:00.000Z');
    const cursor = { date: cursorDate, id: 'event-0' };
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', createdByUserId: 'owner-1', members: [] });
    prisma.groupEvent.findMany.mockResolvedValue([
      { id: 'event-1', startsAt: eventDate },
      { id: 'event-2', startsAt: new Date('2026-10-30T10:00:00.000Z') },
    ]);

    const upcoming = await service.getEvents('reader-1', 'group-1', 'upcoming', 1, cursor, true);
    const past = await service.getEvents('reader-1', 'group-1', 'past', 1, cursor, true);

    expect(prisma.groupEvent.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          groupId: 'group-1',
          startsAt: { gte: expect.any(Date) },
          AND: [{ OR: [{ startsAt: { gt: cursorDate } }, { startsAt: cursorDate, id: { gt: cursor.id } }] }],
        },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 2,
      }),
    );
    expect(prisma.groupEvent.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          groupId: 'group-1',
          startsAt: { lt: expect.any(Date) },
          AND: [{ OR: [{ startsAt: { lt: cursorDate } }, { startsAt: cursorDate, id: { lt: cursor.id } }] }],
        },
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
    );
    expect(upcoming).toMatchObject({
      items: [{ id: 'event-1', startsAt: eventDate }],
      hasMore: true,
      nextCursor: encodeGroupDateCursor({ date: eventDate, id: 'event-1' }),
    });
    expect(past).toMatchObject({ hasMore: true });
  });

  it('rejects non-admin and past group events', async () => {
    prisma.group.findUnique
      .mockResolvedValueOnce({ name: 'Morning runners', createdByUserId: 'owner-1', sports: ['run'] })
      .mockResolvedValueOnce({ name: 'Morning runners', createdByUserId: 'owner-1', sports: ['run'] });
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
    prisma.group.findUnique.mockResolvedValue({ name: 'Morning runners', createdByUserId: 'owner-1', sports: ['run'] });
    prisma.groupMember.findUnique.mockResolvedValue({ role: 'admin', status: 'active' });
    prisma.groupEvent.create.mockResolvedValue({
      id: 'event-1',
      title: 'Sunday run',
      locationName: 'Park',
      distanceKm: 5,
    });
    prisma.transaction.groupMember.findMany.mockResolvedValue([
      { userId: 'event-follower', notificationPreference: 'announcements' },
      { userId: 'muted-follower', notificationPreference: 'off' },
    ]);
    prisma.transaction.profile.findUnique
      .mockResolvedValueOnce({ name: 'Sam', surname: 'Coach', profilePhoto: 'coach.webp', hideProfilePhotos: false })
      .mockResolvedValue({
        emailNotifications: false,
        inAppNotifications: true,
        pushNotifications: false,
        groupPostsNotifications: true,
        groupEventsNotifications: true,
        language: 'english',
      });
    prisma.transaction.notification.create.mockResolvedValue({ id: 'notification-2' });
    const startsAt = new Date(Date.now() + 86400000).toISOString();

    await service.createEvent('admin-1', 'group-1', {
      title: ' Sunday run ',
      startsAt,
      locationName: ' Park ',
      sport: 'run',
      distanceKm: 5,
    });

    expect(prisma.groupEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: 'group-1',
        createdByUserId: 'admin-1',
        title: 'Sunday run',
        locationName: 'Park',
        sport: 'run',
        distanceKm: 5,
        startsAt: new Date(startsAt),
      }),
    });
    expect(prisma.transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 'event-follower',
        type: 'group-event',
        targetType: 'group-event',
        actorProfilePhoto: 'coach.webp',
        content: 'New event in “Morning runners”: Sunday run · 5 km · Park',
      }),
      select: { id: true },
    });
  });

  it('returns not found for missing group events', async () => {
    prisma.group.findUnique.mockResolvedValue(null);
    await expect(service.getEvents('visitor-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
