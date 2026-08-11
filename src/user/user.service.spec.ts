import { UserService } from './user.service';
import { asyncMock, expectInternalServerError } from 'src/__tests__/helpers';

function createPrismaMock() {
  return {
    users: { findMany: asyncMock() },
    profile: { findUnique: asyncMock(), create: asyncMock(), update: asyncMock() },
  };
}

describe('UserService', () => {
  it('performs all user and profile operations', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as never);
    prisma.users.findMany.mockResolvedValue([{ profile: { id: 'profile-1' } }]);
    prisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
    prisma.profile.create.mockResolvedValue({ id: 'profile-1' });
    prisma.profile.update.mockResolvedValue({ id: 'profile-1' });

    await expect(service.getAllUsers()).resolves.toEqual([{ profile: { id: 'profile-1' } }]);
    await expect(service.getProfileByUserId('user-1')).resolves.toEqual({ id: 'profile-1' });
    await expect(service.createProfileByUserId('user-1', { name: 'Ann' })).resolves.toEqual({ id: 'profile-1' });
    await expect(service.updateProfileByProfileId('profile-1', { name: 'Ann' })).resolves.toEqual({ id: 'profile-1' });
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { name: 'Ann', updatedAt: expect.any(Date) },
    });
  });

  it('converts database failures from every operation to an internal server error', async () => {
    const prisma = createPrismaMock();
    const error = new Error('database unavailable');
    prisma.users.findMany.mockRejectedValue(error);
    Object.values(prisma.profile).forEach((operation) => operation.mockRejectedValue(error));
    const service = new UserService(prisma as never);

    await expectInternalServerError(service.getAllUsers());
    await expectInternalServerError(service.getProfileByUserId('u1'));
    await expectInternalServerError(service.createProfileByUserId('u1', {}));
    await expectInternalServerError(service.updateProfileByProfileId('p1', {}));
  });
});
