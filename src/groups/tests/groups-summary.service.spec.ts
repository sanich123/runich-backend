import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { asyncMock } from 'src/tests/helpers';
import { createGroupsServices, createModerationAccessMock, createPrismaMock, groupRow } from './fixtures';

function createGroupsService(
  prisma: ReturnType<typeof createPrismaMock>,
  moderationAccess: ReturnType<typeof createModerationAccessMock>,
  storage?: object,
) {
  return createGroupsServices(prisma, moderationAccess, storage).summary;
}

describe('GroupSummaryService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let moderationAccess: ReturnType<typeof createModerationAccessMock>;
  let service: ReturnType<typeof createGroupsServices>['summary'];

  beforeEach(() => {
    prisma = createPrismaMock();
    moderationAccess = createModerationAccessMock();
    service = createGroupsService(prisma, moderationAccess);
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

  it('shows pending group photo previews only to owners and active members', async () => {
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
          photoAssetId: 'pending-photo',
          photoAsset: { status: 'processing', publishedKey: null },
          members: [{ role: 'member', status: 'active' }],
        }),
      )
      .mockResolvedValueOnce(
        groupRow({
          photoAssetId: 'pending-photo',
          photoAsset: { status: 'processing', publishedKey: null },
          members: [{ role: 'member', status: 'pending' }],
        }),
      )
      .mockResolvedValueOnce(
        groupRow({
          photoAssetId: 'approved-photo',
          photoAsset: { status: 'approved', publishedKey: 'groups/approved.webp' },
          members: [],
        }),
      );
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'owner', status: 'active' })
      .mockResolvedValueOnce({ role: 'member', status: 'active' })
      .mockResolvedValueOnce({ role: 'member', status: 'pending' })
      .mockResolvedValueOnce(null);

    const ownerView = await service.getGroup('owner-1', 'group-1');
    const memberView = await service.getGroup('member-1', 'group-1');
    const pendingApplicantView = await service.getGroup('pending-1', 'group-1');
    const publicView = await service.getGroup('visitor-1', 'group-1');

    expect(ownerView).toMatchObject({ photoPreviewUrl: 'https://cdn.test/pending-preview.webp', photoPending: true });
    expect(ownerView?.pendingRequestCount).toBe(2);
    expect(getOwnerModerationPreviewUrl).toHaveBeenCalledWith('owner-1', 'pending-photo');
    expect(memberView).toMatchObject({ photoPreviewUrl: 'https://cdn.test/pending-preview.webp', photoPending: true });
    expect(pendingApplicantView).toMatchObject({ photoPreviewUrl: null, photoPending: true });
    expect(publicView).toMatchObject({ photoUrl: 'https://cdn.test/approved.webp', photoPreviewUrl: null });
    expect(getOwnerModerationPreviewUrl).toHaveBeenCalledTimes(2);
    expect(getOwnerModerationPreviewUrl).toHaveBeenNthCalledWith(2, 'owner-1', 'pending-photo');
    expect(getPublicUrl).toHaveBeenCalledWith('groups/approved.webp');
  });
});
