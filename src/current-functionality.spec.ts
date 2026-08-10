import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth/auth.service';
import { AccountService } from './account/account.service';
import { ActivityService } from './activity/activity.service';
import { CommentService } from './comment/comment.service';
import { FriendService } from './friend/friend.service';
import { LikeService } from './like/like.service';
import { StatisticService } from './statistic/statistic.service';
import { UserService } from './user/user.service';
import { JwtStrategy } from './auth/jwt.strategy';
import { getLogLevels } from './common/utils/log-levels';
import { getRandomInt, getTimeStampFromTime } from './common/utils/utils';
import { getSpeedInMinsInKm } from './common/parsers/get-speed';
import { chunkArray } from './common/parsers/chunk-array';
import { getReducedMetricsFromActivities, getYearMetricsFromActivities } from './common/statistics/reducers';

process.env.JWT_SECRET = 'test-jwt-secret';

type MockDb = Record<string, Record<string, jest.Mock<() => Promise<unknown>>>>;

const createMock = () => jest.fn<() => Promise<unknown>>();

const db = (): MockDb =>
  new Proxy(
    {},
    {
      get: (rawTarget, model: string) => {
        const target = rawTarget as Record<string, Record<string, jest.Mock<() => Promise<unknown>>>>;
        if (!target[model]) {
          target[model] = new Proxy(
            {},
            {
              get: (rawModel, operation: string) => {
                const model = rawModel as Record<string, jest.Mock<() => Promise<unknown>>>;
                if (!model[operation]) model[operation] = createMock();
                return model[operation];
              },
            },
          );
        }
        return target[model];
      },
    },
  ) as MockDb;

describe('authentication', () => {
  const prisma = db();
  const jwtMock = { sign: jest.fn(() => 'jwt'), verify: jest.fn() };
  const jwt = jwtMock as unknown as JwtService;
  const email = { sendConfirmationCode: jest.fn(), sendResetPasswordLink: jest.fn() };
  const service = new AuthService(prisma as never, jwt, email as never);

  beforeEach(() => jest.clearAllMocks());

  it('registers a user and sends a confirmation code', async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    prisma.users.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.signUp('user@example.com', 'secret123');

    expect(prisma.users.create).toHaveBeenCalled();
    expect(email.sendConfirmationCode).toHaveBeenCalledWith('user@example.com', expect.any(Number), 'jwt');
    expect(result).toEqual({ message: 'Код подтверждения был выслан на Вашу электронную почту' });
  });

  it('rejects unknown users and invalid passwords during login', async () => {
    prisma.users.findUnique.mockResolvedValueOnce(null);
    await expect(service.login('missing@example.com', 'secret')).rejects.toBeInstanceOf(NotFoundException);

    prisma.users.findUnique.mockResolvedValueOnce({ encrypted_password: await bcrypt.hash('correct', 4) });
    await expect(service.login('user@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in confirmed users and rejects unconfirmed users', async () => {
    prisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      encrypted_password: await bcrypt.hash('secret', 4),
      email_confirmed_at: new Date(),
    });
    prisma.users.update.mockResolvedValue({});
    await expect(service.login('user@example.com', 'secret')).resolves.toEqual({
      userId: 'user-1',
      accessToken: 'jwt',
      refreshToken: 'jwt',
    });
    expect(prisma.users.update).toHaveBeenCalled();

    prisma.users.findUnique.mockResolvedValue({ id: 'user-1', encrypted_password: await bcrypt.hash('secret', 4) });
    await expect(service.login('user@example.com', 'secret')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('confirms email by code and verifies tokens', async () => {
    prisma.users.findUnique.mockResolvedValue({ id: 'user-1', confirmation_token: '1234' });
    prisma.users.update.mockResolvedValue({});
    await expect(service.confirmEmailByCode('1234', ' USER@EXAMPLE.COM ')).resolves.toEqual({
      accessToken: 'jwt',
    });
    await expect(service.confirmEmailByCode('bad', 'user@example.com')).rejects.toBeInstanceOf(BadRequestException);

    jwtMock.verify = jest.fn().mockReturnValue({ userId: 'user-1' });
    prisma.users.findUnique.mockResolvedValue({ id: 'user-1', email_confirmed_at: null });
    await expect(service.verifyToken('token')).resolves.toMatchObject({ userId: 'user-1', accessToken: 'jwt' });
    expect(prisma.users.update).toHaveBeenCalled();
  });

  it('validates JWT strategy users', async () => {
    const strategy = new JwtStrategy(prisma as never);
    prisma.users.findUnique.mockResolvedValue({ id: 'user-1' });
    await expect(strategy.validate({ userId: 'user-1' })).resolves.toEqual({ id: 'user-1' });
    prisma.users.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ userId: 'missing' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('account, user and social services', () => {
  beforeEach(() => jest.clearAllMocks());

  it('paginates and filters accounts', async () => {
    const prisma = db();
    prisma.$transaction = createMock().mockResolvedValue([2, [{ id: 'profile-1' }]]) as never;
    const service = new AccountService(prisma as never);
    await expect(service.getAllAccounts({ page: 0, limit: 10, size: 10, offset: 0 })).resolves.toEqual({
      totalItems: 2,
      items: [{ id: 'profile-1' }],
      page: 0,
      size: 10,
    });
    prisma.profile.findMany.mockResolvedValue([{ id: 'profile-1' }]);
    prisma.profile.count.mockResolvedValue(1);
    await expect(
      service.getFilteredAccounts({ page: 0, limit: 10, size: 10, offset: 0 }, { name: 'Ann' }),
    ).resolves.toMatchObject({
      items: [{ id: 'profile-1' }],
    });
  });

  it('updates, finds and upserts profiles', async () => {
    const prisma = db();
    const service = new AccountService(prisma as never);
    prisma.profile.update.mockResolvedValue({ id: 'p1' });
    prisma.profile.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.profile.upsert.mockResolvedValue({ id: 'p1' });
    await expect(
      service.updateProfileInfo({ email: 'a@example.com', emailNotifications: true }, 'p1'),
    ).resolves.toEqual({ id: 'p1' });
    await expect(service.getAccountByUserId('u1')).resolves.toEqual({ id: 'p1' });
    await expect(service.getOrCreateAccountByUserId('u1')).resolves.toEqual({ id: 'p1' });
  });

  it('performs user profile CRUD through Prisma', async () => {
    const prisma = db();
    const service = new UserService(prisma as never);
    prisma.users.findMany.mockResolvedValue([{ profile: { id: 'p1' } }]);
    prisma.profile.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.profile.create.mockResolvedValue({ id: 'p1' });
    prisma.profile.update.mockResolvedValue({ id: 'p1' });
    prisma.users.delete.mockResolvedValue({ id: 'u1' });
    await expect(service.getAllUsers()).resolves.toEqual([{ profile: { id: 'p1' } }]);
    await expect(service.getProfileByUserId('u1')).resolves.toEqual({ id: 'p1' });
    await expect(service.createProfileByUserId('u1', { name: 'Ann' })).resolves.toEqual({ id: 'p1' });
    await expect(service.updateProfileByProfileId('p1', { name: 'Ann' })).resolves.toEqual({ id: 'p1' });
    await expect(service.deleteUserByUserId('u1')).resolves.toEqual({ id: 'u1' });
  });

  it('propagates asynchronous profile write failures', async () => {
    const prisma = db();
    const service = new UserService(prisma as never);
    prisma.profile.create.mockRejectedValue(new Error('database unavailable'));

    await expect(service.createProfileByUserId('u1', { name: 'Ann' })).rejects.toThrow('Internal server error');
  });

  it('creates and deletes friends and likes', async () => {
    const prisma = db();
    const account = { getAccountByUserId: createMock().mockResolvedValue({ id: 'p1' }) };
    const friend = new FriendService(prisma as never, account as never);
    const like = new LikeService(prisma as never, account as never, {} as never);
    prisma.friend.findMany.mockResolvedValue([]);
    prisma.friend.create.mockResolvedValue({ id: 'f1' });
    prisma.friend.delete.mockResolvedValue({ id: 'f1' });
    prisma.like.create.mockResolvedValue({ id: 'l1' });
    prisma.like.delete.mockResolvedValue({ id: 'l1' });
    prisma.like.findMany.mockResolvedValue([]);
    await expect(friend.getUsersYouFollowByUserId('u1')).resolves.toEqual([]);
    await expect(friend.addFriendByFriendId('u2', { userId: 'u1' })).resolves.toEqual({ id: 'f1' });
    await expect(friend.deleteFriendById('f1')).resolves.toEqual({ id: 'f1' });
    await expect(like.addLike({ authorId: 'u1', activityId: 'a1' })).resolves.toEqual({ id: 'l1' });
    await expect(like.deleteLikeById('l1')).resolves.toEqual({ id: 'l1' });
    await expect(like.getLikesByActivityId('a1')).resolves.toEqual([]);
  });

  it('rejects social writes when the author profile is missing', async () => {
    const prisma = db();
    const account = { getAccountByUserId: createMock().mockResolvedValue(null) };
    const friend = new FriendService(prisma as never, account as never);
    const like = new LikeService(prisma as never, account as never, {} as never);
    await expect(friend.addFriendByFriendId('u2', { userId: 'u1' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(like.addLike({ authorId: 'u1', activityId: 'a1' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('activity, comments and statistics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates, updates, reads and deletes activities', async () => {
    const prisma = db();
    const account = { getAccountByUserId: createMock().mockResolvedValue({ id: 'p1' }) };
    const service = new ActivityService(prisma as never, account as never);
    prisma.activity.create.mockResolvedValue({ id: 'a1' });
    prisma.activity.update.mockResolvedValue({ id: 'a1' });
    prisma.activity.findUnique.mockResolvedValue({ id: 'a1', locations: [] });
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.friend.findMany.mockResolvedValue([]);
    prisma.activity.delete.mockResolvedValue({ id: 'a1' });
    const dto = { duration: 100, distance: 1000, speed: 10, sport: 'run' };
    await expect(service.createActivity(dto, 'u1')).resolves.toEqual({ id: 'a1' });
    await expect(service.updateActivity(dto, 'a1')).resolves.toEqual({ id: 'a1' });
    await expect(service.getLocationsByActivityId('a1')).resolves.toEqual({ id: 'a1', locations: [] });
    await expect(service.getActivityByActivityId('a1')).resolves.toEqual({ id: 'a1', locations: [] });
    await expect(service.getActivitesByUserId('u1')).resolves.toEqual({ activities: [], isLastPage: true });
    await expect(service.getActivitiesByTheirIds('a1')).resolves.toEqual([]);
    await expect(service.getAllActivitiesWithFriends('u1')).resolves.toEqual({ activities: [], isLastPage: true });
    await expect(service.deleteActivityById('a1')).resolves.toEqual({ id: 'a1' });
  });

  it('skips duplicate activities during archive migration', async () => {
    const prisma = db();
    const service = new ActivityService(prisma as never, {} as never);
    const activity = {
      duration: 100,
      distance: 1000,
      speed: 10,
      sport: 'run',
      user_id: 'u1',
      profileId: 'p1',
      source: 'strava' as const,
      sourceActivityId: 'strava-activity-1',
    };
    prisma.activity.createMany.mockResolvedValue({ count: 1 });

    await expect(service.createActivitiesFromMigrationArchive([activity])).resolves.toEqual({ success: true });
    expect(prisma.activity.createMany).toHaveBeenCalledWith({ data: [activity], skipDuplicates: true });
  });

  it('creates comments, likes and returns comment collections', async () => {
    const prisma = db();
    const account = { getAccountByUserId: createMock().mockResolvedValue({ id: 'p1' }) };
    const service = new CommentService(prisma as never, account as never, {} as never);
    prisma.comment.count.mockResolvedValue(1);
    prisma.comment.findMany.mockResolvedValue([{ id: 'c1' }]);
    prisma.comment.create.mockResolvedValue({ id: 'c1' });
    prisma.comment.update.mockResolvedValue({ id: 'c1' });
    prisma.comment.delete.mockResolvedValue({ id: 'c1' });
    prisma.commentLike.create.mockResolvedValue({ id: 'cl1' });
    prisma.commentLike.findMany.mockResolvedValue([{ id: 'cl1' }]);
    prisma.commentLike.delete.mockResolvedValue({ id: 'cl1' });
    await expect(service.getCommentsbyActivityId('a1', '10')).resolves.toEqual({
      comments: [{ id: 'c1' }],
      allCommentsLength: 1,
    });
    await expect(
      service.createCommentByActivityId({ comment: 'hello', authorId: 'u1' }, 'a1'),
    ).resolves.toBeUndefined();
    await expect(service.updateCommentByCommentId('updated', 'c1')).resolves.toEqual({ id: 'c1' });
    await expect(service.deleteCommentByCommentId('c1')).resolves.toEqual({ id: 'c1' });
    await expect(service.createCommentLikeByCommentId({ commentId: 'c1', authorId: 'u1' })).resolves.toEqual({
      id: 'cl1',
    });
    await expect(service.getCommentLikesLengthByCommentId('c1')).resolves.toEqual([{ id: 'cl1' }]);
    await expect(service.deleteCommentLikeByLikeId('cl1')).resolves.toEqual({ id: 'cl1' });
  });

  it('reduces activity metrics and groups monthly statistics', async () => {
    const prisma = db();
    const service = new StatisticService(prisma as never);
    const activities = [
      { duration: 100, distance: 1000, speed: 5, date: new Date('2025-01-02'), id: 'a1', sport: 'run' },
      { duration: 200, distance: 2000, speed: 6, date: new Date('2025-01-03'), id: 'a2', sport: 'bike' },
    ];
    prisma.activity.findMany.mockResolvedValue(activities);
    await expect(service.getMonthStatisticsByYearMonth('u1', '2025', '0')).resolves.toMatchObject({
      activitiesReducedBySport: { all: { totalDuration: 300, totalDistance: 3000, totalItems: 2 } },
    });
    await expect(service.getAllActivitiesStatisticsByUserId('u1')).resolves.toEqual({
      totalDistance: 3000,
      totalDuration: 300,
      totalItems: 2,
    });
    await expect(service.getStatisticByYearAndCategory('u1')).resolves.toMatchObject({ isUserHasActivities: true });
    prisma.activity.findMany.mockResolvedValue([]);
    await expect(service.getStatisticByYearAndCategory('u1')).resolves.toEqual({ isUserHasActivities: false });
    expect(service.reduceMetricsFromActivities([{ duration: 2, distance: 3 }])).toEqual({
      totalDistance: 3,
      totalDuration: 2,
      totalItems: 1,
    });
  });
});

describe('utility functions and configuration', () => {
  it('calculates timestamps, speeds and chunks', () => {
    expect(getTimeStampFromTime(new Date(1000))).toBe(1);
    expect(getSpeedInMinsInKm(1000, 60000)).toEqual({ paceAsNumber: 1, paceAsString: '1.00' });
    expect(getSpeedInMinsInKm(0, 0)).toEqual({ paceAsNumber: 0, paceAsString: '0.00' });
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('reduces statistics and exposes environment-specific log levels', () => {
    expect(getReducedMetricsFromActivities([{ duration: 3600000, distance: 2000, speed: 1 }])).toEqual({
      distanceInKm: 2,
      durationInHours: 1,
    });
    expect(getYearMetricsFromActivities([{ totalDistance: 10, totalDuration: 2, medianSpeed: 5, items: 1 }])).toEqual({
      totalYearDuration: 2,
      totalYearDistance: 10,
      totalYearItems: 1,
      averageYearSpeed: 5,
    });
    expect(getLogLevels(true)).toEqual(['log', 'warn', 'error']);
    expect(getLogLevels(false)).toContain('debug');
  });

  it('returns a random integer inside the requested inclusive range', () => {
    const value = getRandomInt(1, 10);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(10);
  });
});
