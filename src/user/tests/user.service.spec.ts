import { UserService } from '../user.service';
import { asyncMock, expectInternalServerError } from 'src/tests/helpers';

function createPrismaMock() {
  return {
    profile: { findUnique: asyncMock(), create: asyncMock(), update: asyncMock(), upsert: asyncMock() },
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
    prisma.profile.upsert.mockResolvedValue({ id: 'profile-1', userId: 'user-1', name: 'Ann' });

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
    prisma.profile.upsert.mockResolvedValue({ id: 'profile-1', userId: 'user-1', name: 'Ann' });

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
