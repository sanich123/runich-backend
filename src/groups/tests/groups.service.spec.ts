import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { asyncMock, transactionMock } from 'src/tests/helpers';
import { GroupsContentService } from '../groups-content.service';
import { GroupsService } from '../groups.service';
import { encodeGroupDateCursor, encodeGroupDistanceCursor, parseGroupDateCursor } from '../groups.pagination';

function createPrismaMock() {
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

function createGroupsService(prisma: ReturnType<typeof createPrismaMock>, moderationAccess: object, storage?: object) {
  const contentService = new GroupsContentService(prisma as never, moderationAccess as never, storage as never);
  return new GroupsService(prisma as never, moderationAccess as never, storage as never, contentService);
}

const groupRow = (overrides: Record<string, unknown> = {}) => ({
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
    service = createGroupsService(prisma, moderationAccess);
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

  it('lists unfiltered groups and supplies defaults for missing summary metadata', async () => {
    prisma.group.findMany.mockResolvedValue([groupRow({ _count: undefined, categoryTags: undefined })]);

    const groups = await service.getGroups('owner-1', { scope: 'all' });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(groups[0]).toMatchObject({ memberCount: 0, categoryTags: [] });
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
      sports: ['run', 'run'],
      privacy: 'closed',
      locationName: ' Moscow ',
    });

    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Morning runners',
          description: 'Saturdays',
          sports: ['run'],
          privacy: 'closed',
          locationName: 'Moscow',
          members: { create: expect.objectContaining({ userId: 'owner-1', role: 'owner', status: 'active' }) },
        }),
      }),
    );
  });

  it('updates owner-managed group fields after normalizing values and validating a replacement photo', async () => {
    const deleteGroupPhotoAsset = asyncMock().mockResolvedValue(undefined);
    const getOwnerModerationPreviewUrl = asyncMock().mockResolvedValue('https://cdn.test/private-group-preview.webp');
    service = createGroupsService(prisma, moderationAccess, { deleteGroupPhotoAsset, getOwnerModerationPreviewUrl });
    prisma.group.findUnique
      .mockResolvedValueOnce({ createdByUserId: 'owner-1', photoAssetId: 'old-photo' })
      .mockResolvedValueOnce(groupRow({ name: 'Evening riders', photoAssetId: 'new-photo' }));
    prisma.mediaModerationAsset.findFirst.mockResolvedValue({ status: 'processing', contentType: 'image/webp' });

    const result = await service.updateGroup('owner-1', 'group-1', {
      name: ' Evening riders ',
      description: ' For weekly rides ',
      sports: ['bike'],
      categoryTags: ['team', 'team'],
      privacy: 'closed',
      locationName: ' Park entrance ',
      photoAssetId: 'new-photo',
    });

    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: {
        name: 'Evening riders',
        description: 'For weekly rides',
        sports: ['bike'],
        categoryTags: ['team'],
        privacy: 'closed',
        locationName: 'Park entrance',
        photoAssetId: 'new-photo',
      },
    });
    expect(deleteGroupPhotoAsset).toHaveBeenCalledWith('owner-1', 'old-photo');
    expect(result).toMatchObject({ id: 'group-1', name: 'Evening riders' });
  });

  it('clears nullable group fields and removes the previous photo', async () => {
    const deleteGroupPhotoAsset = asyncMock().mockRejectedValue(new Error('S3 unavailable'));
    service = createGroupsService(prisma, moderationAccess, { deleteGroupPhotoAsset });
    prisma.group.findUnique
      .mockResolvedValueOnce({ createdByUserId: 'owner-1', photoAssetId: 'previous-photo' })
      .mockResolvedValueOnce(groupRow({ description: null, locationName: null, photoAssetId: null }));

    await expect(
      service.updateGroup('owner-1', 'group-1', { description: null, locationName: null, photoAssetId: null }),
    ).resolves.toMatchObject({ description: null, locationName: null, photoUrl: null });

    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { description: null, locationName: null, photoAssetId: null },
    });
    expect(deleteGroupPhotoAsset).toHaveBeenCalledWith('owner-1', 'previous-photo');
  });

  it('rejects missing groups, non-owner edits, empty updates, and invalid update values', async () => {
    prisma.group.findUnique.mockResolvedValueOnce(null);
    await expect(service.updateGroup('owner-1', 'missing', { name: 'Valid name' })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.group.findUnique.mockResolvedValueOnce({ createdByUserId: 'other-owner', photoAssetId: null });
    await expect(service.updateGroup('visitor-1', 'group-1', { name: 'Valid name' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.group.findUnique.mockResolvedValue({ createdByUserId: 'owner-1', photoAssetId: null });
    await expect(service.updateGroup('owner-1', 'group-1', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateGroup('owner-1', 'group-1', { name: ' ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateGroup('owner-1', 'group-1', { description: 5 } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.updateGroup('owner-1', 'group-1', { sports: [] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateGroup('owner-1', 'group-1', { sports: ['unknown' as 'run'] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.updateGroup('owner-1', 'group-1', {
        categoryTags: ['team', 'local', 'event', 'casual'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateGroup('owner-1', 'group-1', { categoryTags: ['invalid' as 'team'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateGroup('owner-1', 'group-1', { privacy: 'private' as 'open' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.updateGroup('owner-1', 'group-1', { locationName: 5 } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.updateGroup('owner-1', 'group-1', { photoAssetId: 5 } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.group.update).not.toHaveBeenCalled();
  });

  it('rejects unavailable, non-image, and rejected replacement group photos', async () => {
    prisma.group.findUnique.mockResolvedValue({ createdByUserId: 'owner-1', photoAssetId: null });
    prisma.mediaModerationAsset.findFirst.mockResolvedValue(null);
    await expect(service.updateGroup('owner-1', 'group-1', { photoAssetId: 'missing-photo' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.mediaModerationAsset.findFirst.mockResolvedValueOnce({ status: 'queued', contentType: 'text/plain' });
    await expect(service.updateGroup('owner-1', 'group-1', { photoAssetId: 'not-image' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.mediaModerationAsset.findFirst.mockResolvedValueOnce({ status: 'failed', contentType: 'image/webp' });
    await expect(service.updateGroup('owner-1', 'group-1', { photoAssetId: 'failed-photo' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.group.update).not.toHaveBeenCalled();
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
      sports: ['hike'],
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

    prisma.mediaModerationAsset.findFirst.mockResolvedValueOnce({ status: 'queued', contentType: 'application/pdf' });
    await expect(
      service.createGroup('owner-1', {
        name: 'City team',
        sports: ['run'],
        photoAssetId: 'document-asset',
        privacy: 'open',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.mediaModerationAsset.findFirst.mockResolvedValueOnce({ status: 'rejected', contentType: 'image/webp' });
    await expect(
      service.createGroup('owner-1', {
        name: 'City team',
        sports: ['run'],
        photoAssetId: 'rejected-asset',
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

  it('requires exactly one supported activity and up to three valid categories', async () => {
    await expect(
      service.createGroup('owner-1', { name: 'Group', sports: [], privacy: 'open' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createGroup('owner-1', { name: 'Group', sports: ['run', 'walk'], privacy: 'open' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createGroup('owner-1', {
        name: 'Group',
        sports: ['run'],
        categoryTags: ['casual', 'brand', 'team', 'local'],
        privacy: 'open',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createGroup('owner-1', {
        name: 'Group',
        sports: ['run'],
        categoryTags: ['invalid' as 'casual'],
        privacy: 'open',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.group.create).not.toHaveBeenCalled();
  });

  it('rejects missing groups and adds a member directly to an open group', async () => {
    prisma.group.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'group-1', privacy: 'open', createdByUserId: 'owner-1' })
      .mockResolvedValueOnce(groupRow({ members: [{ role: 'member', status: 'active' }] }));
    prisma.groupMember.findUnique.mockResolvedValue(null);
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

  it('returns group state and rejects inaccessible groups', async () => {
    prisma.group.findUnique.mockResolvedValueOnce(null);
    await expect(service.getGroup('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);

    prisma.group.findUnique.mockResolvedValue(groupRow());
    moderationAccess.areBlocked.mockResolvedValue(true);
    await expect(service.getGroup('user-1', 'group-1')).rejects.toBeInstanceOf(ForbiddenException);

    moderationAccess.areBlocked.mockResolvedValue(false);
    prisma.group.findUnique.mockResolvedValue(groupRow({ moderationStatus: 'hidden' }));
    await expect(service.getGroup('user-1', 'group-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows an owner preview for a pending group photo and a public URL for an approved photo', async () => {
    const getOwnerModerationPreviewUrl = asyncMock().mockResolvedValue('https://cdn.test/pending-preview.webp');
    const getPublicUrl = jest.fn().mockReturnValue('https://cdn.test/approved.webp');
    service = createGroupsService(prisma, moderationAccess, { getOwnerModerationPreviewUrl, getPublicUrl });
    prisma.groupMember.count.mockResolvedValue(2);
    prisma.group.findUnique
      .mockResolvedValueOnce(
        groupRow({
          photoAssetId: 'pending-photo',
          photoAsset: { status: 'processing', publishedKey: null },
          members: [{ role: 'owner', status: 'active' }],
        }),
      )
      .mockResolvedValueOnce(
        groupRow({
          photoAssetId: 'approved-photo',
          photoAsset: { status: 'approved', publishedKey: 'groups/approved.webp' },
          members: [],
        }),
      );

    const ownerView = await service.getGroup('owner-1', 'group-1');
    const publicView = await service.getGroup('member-1', 'group-1');

    expect(ownerView).toMatchObject({ photoPreviewUrl: 'https://cdn.test/pending-preview.webp', photoPending: true });
    expect(ownerView?.pendingRequestCount).toBe(2);
    expect(getOwnerModerationPreviewUrl).toHaveBeenCalledWith('owner-1', 'pending-photo');
    expect(publicView).toMatchObject({ photoUrl: 'https://cdn.test/approved.webp', photoPreviewUrl: null });
    expect(getPublicUrl).toHaveBeenCalledWith('groups/approved.webp');
  });

  it('deletes groups only for their owner and tolerates photo cleanup failures', async () => {
    prisma.group.findUnique.mockResolvedValueOnce(null);
    await expect(service.deleteGroup('owner-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);

    prisma.group.findUnique.mockResolvedValueOnce({ createdByUserId: 'other-owner', photoAssetId: null });
    await expect(service.deleteGroup('member-1', 'group-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.group.delete).not.toHaveBeenCalled();

    prisma.group.findUnique.mockResolvedValueOnce({ createdByUserId: 'owner-1', photoAssetId: null });
    await expect(service.deleteGroup('owner-1', 'group-1')).resolves.toBeUndefined();
    expect(prisma.group.delete).toHaveBeenCalledWith({ where: { id: 'group-1' } });
  });

  it('cleans up a deleted group photo without failing the group deletion', async () => {
    const deleteGroupPhotoAsset = asyncMock().mockRejectedValue(new Error('S3 unavailable'));
    service = createGroupsService(prisma, moderationAccess, { deleteGroupPhotoAsset });
    prisma.group.findUnique.mockResolvedValue({ createdByUserId: 'owner-1', photoAssetId: 'photo-1' });

    await expect(service.deleteGroup('owner-1', 'group-1')).resolves.toBeUndefined();

    expect(prisma.group.delete).toHaveBeenCalledWith({ where: { id: 'group-1' } });
    expect(deleteGroupPhotoAsset).toHaveBeenCalledWith('owner-1', 'photo-1');
  });

  it('sends a request to closed groups and does not demote existing members on repeated joins', async () => {
    prisma.group.findUnique
      .mockResolvedValueOnce({ id: 'group-1', privacy: 'closed', createdByUserId: 'owner-1' })
      .mockResolvedValueOnce(groupRow({ privacy: 'closed', members: [{ role: 'member', status: 'pending' }] }));
    prisma.groupMember.findUnique.mockResolvedValue(null);
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

  it('returns not found for missing group statistics, posts, and events', async () => {
    prisma.group.findUnique.mockResolvedValue(null);

    await expect(service.getMonthlyLeaderboard('visitor-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getPosts('visitor-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getEvents('visitor-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
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
      createdByUserId: 'owner-1',
      members: [{ status: 'active', feedPreference: 'admins' }],
    });
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'admin-1' }]);
    prisma.groupPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        createdByUserId: 'admin-1',
        text: 'Sunday run',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: null,
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
      createdByUserId: 'owner-1',
      members: [{ status: 'active', feedPreference: 'admins' }],
    });
    prisma.groupMember.findMany.mockResolvedValue([]);

    await expect(service.getPosts('member-1', 'group-1')).resolves.toEqual([]);
    expect(prisma.groupPost.findMany).not.toHaveBeenCalled();
  });

  it('returns approved group post photos and hides missing author profiles', async () => {
    const getPublicUrl = jest.fn().mockReturnValue('https://cdn.test/group-post.webp');
    const getOwnerModerationPreviewUrls = asyncMock().mockResolvedValue({});
    service = createGroupsService(prisma, moderationAccess, { getPublicUrl, getOwnerModerationPreviewUrls });
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', createdByUserId: 'owner-1', members: [] });
    prisma.groupPost.findMany.mockResolvedValue([
      {
        id: 'post-2',
        createdByUserId: 'author-1',
        text: 'Club update',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: 'approved-post-photo',
        author: { id: 'author-1', profile: null },
        photoAsset: { status: 'approved', publishedKey: 'groups/group-1/post.webp' },
      },
    ]);

    const result = await service.getPosts('viewer-1', 'group-1');

    expect(result).toEqual([expect.objectContaining({ author: null, photoUrl: 'https://cdn.test/group-post.webp' })]);
    expect(getPublicUrl).toHaveBeenCalledWith('groups/group-1/post.webp');
    expect(getOwnerModerationPreviewUrls).not.toHaveBeenCalled();
  });

  it('returns pending-photo status to readers and private preview URLs only to the post author', async () => {
    const getOwnerModerationPreviewUrls = asyncMock().mockResolvedValue({
      'pending-photo': 'https://cdn.test/private-preview.webp',
    });
    const getPublicUrl = jest.fn().mockReturnValue('https://cdn.test/approved.webp');
    service = createGroupsService(prisma, moderationAccess, { getOwnerModerationPreviewUrls, getPublicUrl });
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', createdByUserId: 'group-owner', members: [] });
    prisma.groupPost.findMany.mockResolvedValue([
      {
        id: 'pending-post',
        createdByUserId: 'post-author',
        text: 'Pending photo',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: 'pending-photo',
        author: null,
        photoAsset: { status: 'review_required', publishedKey: null },
      },
      {
        id: 'rejected-post',
        createdByUserId: 'post-author',
        text: 'Rejected photo',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: 'rejected-photo',
        author: null,
        photoAsset: { status: 'rejected', publishedKey: null },
      },
      {
        id: 'text-post',
        createdByUserId: 'post-author',
        text: 'Text only',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: null,
        author: null,
        photoAsset: null,
      },
    ]);

    const authorView = await service.getPosts('post-author', 'group-1');
    expect(authorView).toEqual([
      expect.objectContaining({
        hasPhoto: true,
        photoPending: true,
        photoPreviewUrl: 'https://cdn.test/private-preview.webp',
      }),
      expect.objectContaining({ hasPhoto: true, photoPending: false, photoPreviewUrl: null }),
      expect.not.objectContaining({ hasPhoto: true }),
    ]);
    expect(getOwnerModerationPreviewUrls).toHaveBeenCalledWith('post-author', ['pending-photo']);

    const readerView = await service.getPosts('reader-1', 'group-1');
    expect(readerView[0]).toMatchObject({ hasPhoto: true, photoPending: true, photoPreviewUrl: null, photoUrl: null });
    expect(getOwnerModerationPreviewUrls).toHaveBeenCalledTimes(1);
  });

  it('omits an unavailable private post-photo preview', async () => {
    const getOwnerModerationPreviewUrls = asyncMock().mockRejectedValue(new Error('Preview unavailable'));
    service = createGroupsService(prisma, moderationAccess, { getOwnerModerationPreviewUrls });
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', createdByUserId: 'owner-1', members: [] });
    prisma.groupPost.findMany.mockResolvedValue([
      {
        id: 'post-3',
        createdByUserId: 'owner-1',
        text: 'Waiting for moderation',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: 'pending-photo',
        author: null,
        photoAsset: { status: 'processing', publishedKey: null },
      },
    ]);

    await expect(service.getPosts('owner-1', 'group-1')).resolves.toEqual([
      expect.objectContaining({ hasPhoto: true, photoPending: true, photoPreviewUrl: null }),
    ]);
  });

  it('requires active membership to publish group posts', async () => {
    prisma.group.findUnique.mockResolvedValue({ name: 'Morning runners', createdByUserId: 'owner-1' });
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'pending' });

    await expect(service.createPost('member-1', 'group-1', { text: 'Hello group' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.groupPost.create).not.toHaveBeenCalled();
  });

  it('publishes trimmed group post text for active members', async () => {
    prisma.group.findUnique.mockResolvedValue({ name: 'Morning runners', createdByUserId: 'owner-1' });
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'active' });
    prisma.groupPost.create.mockResolvedValue({ id: 'post-1', text: 'Hello group' });

    await service.createPost('member-1', 'group-1', { text: ' Hello group ' });

    expect(prisma.groupPost.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', createdByUserId: 'member-1', text: 'Hello group', photoAssetId: null },
    });
  });

  it('returns a keyset-paginated post page and a terminal page without a cursor', async () => {
    const cursor = { date: new Date('2026-10-28T10:00:00.000Z'), id: 'post-0' };
    const firstPostDate = new Date('2026-10-29T10:00:00.000Z');
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', createdByUserId: 'owner-1', members: [] });
    prisma.groupPost.findMany.mockResolvedValueOnce([
      {
        id: 'post-1',
        createdByUserId: 'author-1',
        text: 'First post',
        createdAt: firstPostDate,
        photoAssetId: null,
        author: null,
        photoAsset: null,
      },
      {
        id: 'post-2',
        createdByUserId: 'author-2',
        text: 'Second post',
        createdAt: new Date('2026-10-29T11:00:00.000Z'),
        photoAssetId: null,
        author: null,
        photoAsset: null,
      },
    ]);

    const page = await service.getPosts('reader-1', 'group-1', 1, cursor, true);

    expect(prisma.groupPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 'group-1',
          AND: [{ OR: [{ createdAt: { lt: cursor.date } }, { createdAt: cursor.date, id: { lt: cursor.id } }] }],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
    );
    expect(page).toMatchObject({
      items: [{ id: 'post-1', text: 'First post' }],
      hasMore: true,
      nextCursor: encodeGroupDateCursor({ date: firstPostDate, id: 'post-1' }),
    });

    prisma.groupPost.findMany.mockResolvedValueOnce([]);
    await expect(service.getPosts('reader-1', 'group-1', 1, undefined, true)).resolves.toMatchObject({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('accepts a pending image and rejects non-image or blank group posts', async () => {
    prisma.group.findUnique.mockResolvedValue({ name: 'Morning runners', createdByUserId: 'owner-1' });
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'active' });
    prisma.mediaModerationAsset.findFirst
      .mockResolvedValueOnce({ status: 'queued', contentType: 'image/jpeg' })
      .mockResolvedValueOnce({ status: 'approved', contentType: 'application/pdf' });
    prisma.groupPost.create.mockResolvedValue({ id: 'post-photo-1' });

    await expect(
      service.createPost('member-1', 'group-1', { text: 'Post', photoAssetId: 'rejected-photo' }),
    ).resolves.toEqual({ id: 'post-photo-1' });
    await expect(
      service.createPost('member-1', 'group-1', { text: 'Post', photoAssetId: 'not-an-image' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createPost('member-1', 'group-1', { text: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('notifies post readers according to announcement and per-group preferences', async () => {
    prisma.group.findUnique.mockResolvedValue({ name: 'Morning runners', createdByUserId: 'owner-1' });
    prisma.groupMember.findUnique.mockResolvedValue({ role: 'member', status: 'active' });
    prisma.groupPost.create.mockResolvedValue({ id: 'post-notify-1' });
    prisma.transaction.groupMember.findMany.mockResolvedValue([
      { userId: 'all-reader', notificationPreference: 'all' },
      { userId: 'announcement-reader', notificationPreference: 'announcements' },
      { userId: 'muted-reader', notificationPreference: 'off' },
    ]);
    prisma.transaction.profile.findUnique
      .mockResolvedValueOnce({ name: 'Alex', surname: 'Runner', profilePhoto: 'private.webp', hideProfilePhotos: true })
      .mockResolvedValue({
        emailNotifications: false,
        inAppNotifications: true,
        pushNotifications: false,
        groupPostsNotifications: true,
        groupEventsNotifications: true,
        language: 'russian',
      });
    prisma.transaction.notification.create.mockResolvedValue({ id: 'notification-1' });

    await service.createPost('member-1', 'group-1', { text: '  Sunday run  ' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.groupPost.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', createdByUserId: 'member-1', text: 'Sunday run', photoAssetId: null },
    });
    expect(prisma.transaction.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 'all-reader',
        type: 'group-post',
        targetType: 'group-post',
        actorProfilePhoto: null,
        content: 'Новая запись в группе «Morning runners»: Sunday run',
      }),
      select: { id: true },
    });
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
});
