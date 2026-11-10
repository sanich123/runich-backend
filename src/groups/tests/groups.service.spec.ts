import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { asyncMock } from 'src/tests/helpers';
import { createGroupsServices, createModerationAccessMock, createPrismaMock, groupRow } from './fixtures';

function createGroupsService(
  prisma: ReturnType<typeof createPrismaMock>,
  moderationAccess: ReturnType<typeof createModerationAccessMock>,
  storage?: object,
) {
  return createGroupsServices(prisma, moderationAccess, storage).groups;
}

describe('GroupsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let moderationAccess: ReturnType<typeof createModerationAccessMock>;
  let service: ReturnType<typeof createGroupsServices>['groups'];

  beforeEach(() => {
    prisma = createPrismaMock();
    moderationAccess = createModerationAccessMock();
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
});
