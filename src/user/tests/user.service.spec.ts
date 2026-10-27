import { BadRequestException } from '@nestjs/common';
import { UserService } from '../user.service';
import { asyncMock, expectInternalServerError } from 'src/tests/helpers';
import { makeBasicProfile, makePendingAvatarProfile } from 'src/tests/fixtures/profile.fixtures';

function createPrismaMock() {
  return {
    profile: {
      findUnique: asyncMock(),
      create: asyncMock(),
      update: asyncMock(),
      upsert: asyncMock(),
      updateMany: asyncMock(),
    },
    mediaModerationAsset: { findFirst: asyncMock() },
  };
}

describe('UserService', () => {
  it('performs user profile operations', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as never);
    prisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
    prisma.profile.create.mockResolvedValue({ id: 'profile-1' });
    prisma.profile.update.mockResolvedValue({ id: 'profile-1' });

    await expect(service.getProfileByUserId('user-1')).resolves.toEqual({ id: 'profile-1' });
    await expect(service.createProfileByUserId('user-1', { name: 'Ann' })).resolves.toEqual({ id: 'profile-1' });
    await expect(service.updateProfileByProfileId('profile-1', { name: 'Ann' })).resolves.toEqual({ id: 'profile-1' });
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { name: 'Ann', updatedAt: expect.any(Date) },
    });
  });

  it('updates or creates a profile by the authenticated user id', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as never);
    prisma.profile.upsert.mockResolvedValue(makeBasicProfile());

    await expect(service.updateProfileByUserId('user-1', 'user-1', { name: 'Ann' })).resolves.toEqual({
      id: 'profile-1',
      userId: 'user-1',
      name: 'Ann',
    });
    expect(prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { name: 'Ann', updatedAt: expect.any(Date) },
      create: { name: 'Ann', updatedAt: expect.any(Date), userId: 'user-1' },
    });
  });

  it('persists whether other users can follow the profile', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as never);
    prisma.profile.upsert.mockResolvedValue({ id: 'profile-1', userId: 'user-1', allowNewFollowers: false });

    await expect(service.updateProfileByUserId('user-1', 'user-1', { allowNewFollowers: false })).resolves.toEqual({
      id: 'profile-1',
      userId: 'user-1',
      allowNewFollowers: false,
    });
    expect(prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { allowNewFollowers: false, updatedAt: expect.any(Date) },
      create: { allowNewFollowers: false, updatedAt: expect.any(Date), userId: 'user-1' },
    });
  });

  it('accepts a profile id when it belongs to the authenticated user', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as never);
    prisma.profile.findUnique.mockResolvedValue({ userId: 'user-1' });
    prisma.profile.upsert.mockResolvedValue(makeBasicProfile());

    await expect(service.updateProfileByUserId('profile-1', 'user-1', { name: 'Ann' })).resolves.toEqual({
      id: 'profile-1',
      userId: 'user-1',
      name: 'Ann',
    });
    expect(prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { name: 'Ann', updatedAt: expect.any(Date) },
      create: { name: 'Ann', updatedAt: expect.any(Date), userId: 'user-1' },
    });
  });

  it('keeps the published avatar visible to subscribers while keeping a pending preview private', async () => {
    const prisma = createPrismaMock();
    const storage = {
      getModerationUploadStatuses: asyncMock().mockResolvedValue({
        items: [{ assetId: 'asset-1', status: 'review_required', contentType: 'image/webp' }],
      }),
      getOwnerModerationPreviewUrl: asyncMock().mockResolvedValue('https://private.example.test/preview'),
    };
    const moderationAccess = { areBlocked: asyncMock().mockResolvedValue(false) };
    const service = new UserService(prisma as never, undefined, storage as never, moderationAccess as never);
    const pendingProfile = makePendingAvatarProfile();
    prisma.profile.findUnique.mockResolvedValue(pendingProfile);

    const subscriberView = await service.getProfileByUserId('owner-1', 'subscriber-1');
    expect(subscriberView).toMatchObject({
      profilePhoto: 'https://public.example.test/old-avatar.webp',
      profilePhotoBlurhash: 'old-hash',
    });
    expect(subscriberView).not.toHaveProperty('profilePhotoReviewStatus');
    expect(subscriberView).not.toHaveProperty('profilePhotoPendingAssetId');
    expect(storage.getOwnerModerationPreviewUrl).not.toHaveBeenCalled();

    const ownerView = await service.getProfileByUserId('owner-1');
    expect(ownerView).toMatchObject({
      profilePhoto: 'https://private.example.test/preview',
      profilePhotoBlurhash: 'pending-hash',
      profilePhotoReviewStatus: 'review_required',
    });
  });

  it('keeps a first-time pending photo private when there is no published avatar', async () => {
    const prisma = createPrismaMock();
    const storage = {
      getModerationUploadStatuses: asyncMock().mockResolvedValue({
        items: [{ assetId: 'asset-1', status: 'review_required', contentType: 'image/webp' }],
      }),
      getOwnerModerationPreviewUrl: asyncMock().mockResolvedValue('https://private.example.test/preview'),
    };
    const service = new UserService(prisma as never, undefined, storage as never);
    prisma.profile.findUnique.mockResolvedValue(
      makePendingAvatarProfile({ profilePhoto: null, profilePhotoBlurhash: null }),
    );

    await expect(service.getProfileByUserId('owner-1', 'subscriber-1')).resolves.toMatchObject({
      profilePhoto: null,
      profilePhotoBlurhash: 'pending-hash',
      profilePhotoReviewStatus: 'review_required',
    });
    expect(storage.getOwnerModerationPreviewUrl).not.toHaveBeenCalled();
  });

  it('links a pending profile upload without changing the published avatar', async () => {
    const prisma = createPrismaMock();
    const storage = {
      getModerationUploadStatuses: asyncMock().mockResolvedValue({
        items: [{ assetId: 'asset-1', status: 'queued', contentType: 'image/webp' }],
      }),
      getOwnerModerationPreviewUrl: asyncMock().mockResolvedValue('https://private.example.test/preview'),
    };
    const service = new UserService(prisma as never, undefined, storage as never);
    prisma.mediaModerationAsset.findFirst.mockResolvedValue({ status: 'queued', publishedKey: null });
    prisma.profile.upsert.mockResolvedValue(makePendingAvatarProfile());

    await expect(
      service.updateProfileByUserId('owner-1', 'owner-1', {
        profilePhotoAssetId: 'asset-1',
        profilePhotoBlurhash: 'pending-hash',
      }),
    ).resolves.toMatchObject({
      profilePhoto: 'https://private.example.test/preview',
      profilePhotoBlurhash: 'pending-hash',
      profilePhotoReviewStatus: 'queued',
    });
    expect(prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'owner-1' },
      update: {
        profilePhotoPendingAssetId: 'asset-1',
        profilePhotoPendingBlurhash: 'pending-hash',
        updatedAt: expect.any(Date),
      },
      create: {
        profilePhotoPendingAssetId: 'asset-1',
        profilePhotoPendingBlurhash: 'pending-hash',
        updatedAt: expect.any(Date),
        userId: 'owner-1',
      },
    });
  });

  it('uses an already approved profile photo when linking finishes after moderation', async () => {
    const prisma = createPrismaMock();
    const storage = {
      publishApprovedModerationAsset: asyncMock().mockResolvedValue({
        url: 'https://public.example.test/new-avatar.webp',
      }),
    };
    const service = new UserService(prisma as never, undefined, storage as never);
    prisma.mediaModerationAsset.findFirst.mockResolvedValue({ status: 'approved', publishedKey: 'owner-1/new.webp' });
    prisma.profile.upsert.mockResolvedValue({
      id: 'profile-1',
      userId: 'owner-1',
      profilePhoto: 'https://public.example.test/new-avatar.webp',
      profilePhotoBlurhash: 'new-hash',
      profilePhotoPendingAssetId: null,
      profilePhotoPendingBlurhash: null,
    });

    await expect(
      service.updateProfileByUserId('owner-1', 'owner-1', {
        profilePhotoAssetId: 'asset-1',
        profilePhotoBlurhash: 'new-hash',
      }),
    ).resolves.toMatchObject({
      profilePhoto: 'https://public.example.test/new-avatar.webp',
      profilePhotoBlurhash: 'new-hash',
    });
    expect(storage.publishApprovedModerationAsset).toHaveBeenCalledWith('owner-1', 'asset-1');
    expect(prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'owner-1' },
      update: {
        profilePhoto: 'https://public.example.test/new-avatar.webp',
        profilePhotoBlurhash: 'new-hash',
        profilePhotoPendingAssetId: null,
        profilePhotoPendingBlurhash: null,
        updatedAt: expect.any(Date),
      },
      create: {
        profilePhoto: 'https://public.example.test/new-avatar.webp',
        profilePhotoBlurhash: 'new-hash',
        profilePhotoPendingAssetId: null,
        profilePhotoPendingBlurhash: null,
        updatedAt: expect.any(Date),
        userId: 'owner-1',
      },
    });
  });

  it('clears the pending avatar reference when the profile photo is explicitly removed', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as never);
    prisma.profile.upsert.mockResolvedValue({
      id: 'profile-1',
      userId: 'owner-1',
      profilePhoto: null,
      profilePhotoBlurhash: null,
      profilePhotoPendingAssetId: null,
      profilePhotoPendingBlurhash: null,
    });

    await service.updateProfileByUserId('owner-1', 'owner-1', { profilePhoto: null });

    expect(prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'owner-1' },
      update: {
        profilePhoto: null,
        profilePhotoBlurhash: null,
        profilePhotoPendingAssetId: null,
        profilePhotoPendingBlurhash: null,
        updatedAt: expect.any(Date),
      },
      create: {
        profilePhoto: null,
        profilePhotoBlurhash: null,
        profilePhotoPendingAssetId: null,
        profilePhotoPendingBlurhash: null,
        updatedAt: expect.any(Date),
        userId: 'owner-1',
      },
    });
  });

  it.each(['rejected', 'failed'])('clears an avatar after moderation status becomes %s', async (status) => {
    const prisma = createPrismaMock();
    const storage = {
      getModerationUploadStatuses: asyncMock().mockResolvedValue({
        items: [{ assetId: 'asset-1', status, contentType: 'image/webp' }],
      }),
    };
    const service = new UserService(prisma as never, undefined, storage as never);
    prisma.profile.findUnique.mockResolvedValue(makePendingAvatarProfile());

    await expect(service.getProfileByUserId('owner-1')).resolves.toMatchObject({
      profilePhoto: 'https://public.example.test/old-avatar.webp',
      profilePhotoBlurhash: 'old-hash',
    });
    expect(prisma.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'owner-1', profilePhotoPendingAssetId: 'asset-1' },
      data: {
        profilePhotoPendingAssetId: null,
        profilePhotoPendingBlurhash: null,
        updatedAt: expect.any(Date),
      },
    });
  });

  it('publishes the approved avatar after moderation completed before the profile refresh', async () => {
    const prisma = createPrismaMock();
    const storage = {
      getModerationUploadStatuses: asyncMock().mockResolvedValue({
        items: [
          {
            assetId: 'asset-1',
            status: 'approved',
            url: 'https://public.example.test/approved-avatar.webp',
            contentType: 'image/webp',
          },
        ],
      }),
    };
    const service = new UserService(prisma as never, undefined, storage as never);
    prisma.profile.findUnique.mockResolvedValue(makePendingAvatarProfile());

    await expect(service.getProfileByUserId('owner-1')).resolves.toMatchObject({
      profilePhoto: 'https://public.example.test/approved-avatar.webp',
      profilePhotoBlurhash: 'pending-hash',
    });
    expect(prisma.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'owner-1', profilePhotoPendingAssetId: 'asset-1' },
      data: {
        profilePhoto: 'https://public.example.test/approved-avatar.webp',
        profilePhotoBlurhash: 'pending-hash',
        profilePhotoPendingAssetId: null,
        profilePhotoPendingBlurhash: null,
        updatedAt: expect.any(Date),
      },
    });
  });

  it('preserves the published avatar if moderation storage is temporarily unavailable', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as never);
    prisma.profile.findUnique.mockResolvedValue(makePendingAvatarProfile());

    await expect(service.getProfileByUserId('owner-1')).resolves.toMatchObject({
      profilePhoto: 'https://public.example.test/old-avatar.webp',
      profilePhotoBlurhash: 'old-hash',
    });
  });

  it('rejects a profile photo asset that is not owned by the profile user', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as never, undefined, {} as never);
    prisma.mediaModerationAsset.findFirst.mockResolvedValue(null);

    await expect(
      service.updateProfileByUserId('owner-1', 'owner-1', { profilePhotoAssetId: 'asset-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.profile.upsert).not.toHaveBeenCalled();
  });

  it('converts database failures from every operation to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
    Object.values(prisma.profile).forEach((operation) => operation.mockRejectedValue(error));
    const service = new UserService(prisma as never);

    await expectInternalServerError(service.getProfileByUserId('u1'));
    await expectInternalServerError(service.createProfileByUserId('u1', {}));
    await expectInternalServerError(service.updateProfileByProfileId('p1', {}));
  });
});
