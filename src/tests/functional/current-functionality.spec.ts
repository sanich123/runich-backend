import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../auth/services/auth.service';
import { AccountService } from '../../account/account.service';
import { ActivityService } from '../../activity/services/activity.service';
import { makeActivityDto, makeMigrationSuccessResult } from '../../activity/tests/fixtures';
import {
  makeConfirmedPasswordUser,
  makePasswordUser,
  makePendingConfirmationUser,
  makeSessionTokens,
} from '../../auth/tests/fixtures';
import { CommentService } from '../../comment/comment.service';
import { FriendService } from '../../friend/friend.service';
import { LikeService } from '../../like/like.service';
import { StatisticService } from '../../statistic/statistic.service';
import { makeActivityTotals, makeSportActivityTotals, makeStatisticActivities } from '../../statistic/tests/fixtures';
import { UserService } from '../../user/user.service';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { getLogLevels } from '../../common/utils/log-levels';
import { getRandomInt, getTimeStampFromTime } from '../../common/utils/utils';
import { getSpeedInMinsInKm } from '../../common/parsers/get-speed';
import { chunkArray } from '../../common/parsers/chunk-array';
import { getReducedMetricsFromActivities, getYearMetricsFromActivities } from '../../common/statistics/reducers';

process.env.JWT_SECRET = 'test-jwt-secret';

type MockDb = Record<string, Record<string, jest.Mock<() => Promise<unknown>>>>;

const createMock = () => jest.fn<() => Promise<unknown>>();

const db = (): MockDb => {
  const target: Record<string, unknown> = {};
  const client = new Proxy(target, {
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
  }) as unknown as MockDb;
  const transactionClient = new Proxy(
    {},
    {
      get: (_rawTarget, model: string) => client[model],
    },
  ) as MockDb;
  Object.assign(target, {
    $transaction: jest.fn((callback: (client: MockDb) => Promise<unknown>) => callback(transactionClient)),
  });
  return client;
};

describe('authentication', () => {
  const prisma = db();
  const jwtMock = { sign: jest.fn(() => 'jwt'), verify: jest.fn() };
  const jwt = jwtMock as unknown as JwtService;
  const email = { sendConfirmationCode: jest.fn() };
  const tokenService = {
    createEmailLoginCredential: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue('jwt'),
    createSessionTokens: jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue(makeSessionTokens({ accessToken: 'jwt', refreshToken: 'jwt' })),
    consumeEmailLoginCode: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue('user-1'),
  };
  const service = new AuthService(prisma as never, jwt, email as never, tokenService as never);

  beforeEach(() => jest.clearAllMocks());

  it('registers a user and sends a confirmation code', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.signUp('user@example.com', 'secret123');

    expect(prisma.user.create).toHaveBeenCalled();
    expect(email.sendConfirmationCode).toHaveBeenCalledWith('user@example.com', expect.any(Number), 'jwt');
    expect(result).toEqual({ message: 'Код подтверждения был выслан на Вашу электронную почту' });
  });

  it('rejects unknown users and invalid passwords during login', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.login('missing@example.com', 'secret')).rejects.toBeInstanceOf(NotFoundException);

    prisma.user.findUnique.mockResolvedValueOnce({ encryptedPassword: await bcrypt.hash('correct', 4) });
    await expect(service.login('user@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in confirmed users and rejects unconfirmed users', async () => {
    prisma.user.findUnique.mockResolvedValue(makeConfirmedPasswordUser(await bcrypt.hash('secret', 4)));
    prisma.user.update.mockResolvedValue({});
    await expect(service.login('user@example.com', 'secret')).resolves.toEqual(
      makeSessionTokens({ accessToken: 'jwt', refreshToken: 'jwt' }),
    );
    expect(prisma.user.update).toHaveBeenCalled();

    prisma.user.findUnique.mockResolvedValue(makePasswordUser(await bcrypt.hash('secret', 4)));
    await expect(service.login('user@example.com', 'secret')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('confirms email by code and verifies tokens', async () => {
    prisma.user.findUnique.mockResolvedValue(makePendingConfirmationUser());
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});
    await expect(service.confirmEmailByCode('1234', ' USER@EXAMPLE.COM ')).resolves.toEqual(
      makeSessionTokens({ accessToken: 'jwt', refreshToken: 'jwt' }),
    );
    await expect(service.confirmEmailByCode('bad', 'user@example.com')).rejects.toBeInstanceOf(BadRequestException);

    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailConfirmedAt: null });
    await expect(service.verifyToken('token')).resolves.toMatchObject({ userId: 'user-1', accessToken: 'jwt' });
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('validates JWT strategy users', async () => {
    const strategy = new JwtStrategy(prisma as never);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    await expect(strategy.validate({ userId: 'user-1' })).resolves.toEqual({ id: 'user-1' });
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ userId: 'missing' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('account, user and social services', () => {
  beforeEach(() => jest.clearAllMocks());

  it('paginates and filters accounts', async () => {
    const prisma = db();
    const service = new AccountService(prisma as never);
    prisma.profile.findMany.mockResolvedValue([{ id: 'profile-1', userId: 'user-1' }]);
    await expect(service.getFilteredAccounts('10', undefined, { name: 'Ann' })).resolves.toMatchObject({
      items: [{ id: 'profile-1' }],
    });
  });

  it('updates, finds and upserts profiles', async () => {
    const prisma = db();
    const service = new AccountService(prisma as never);
    prisma.profile.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.profile.upsert.mockResolvedValue({ id: 'p1' });
    await expect(service.getAccountByUserId('u1')).resolves.toEqual({ id: 'p1' });
    await expect(service.getOrCreateAccountByUserId('u1')).resolves.toEqual({ id: 'p1' });
  });

  it('performs user profile CRUD through Prisma', async () => {
    const prisma = db();
    const service = new UserService(prisma as never);
    prisma.profile.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.profile.create.mockResolvedValue({ id: 'p1' });
    prisma.profile.update.mockResolvedValue({ id: 'p1' });
    await expect(service.getProfileByUserId('u1')).resolves.toEqual({ id: 'p1' });
    await expect(service.createProfileByUserId('u1', { name: 'Ann' })).resolves.toEqual({ id: 'p1' });
    await expect(service.updateProfileByProfileId('p1', { name: 'Ann' })).resolves.toEqual({ id: 'p1' });
  });

  it('propagates asynchronous profile write failures', async () => {
    const prisma = db();
    const service = new UserService(prisma as never);
    prisma.profile.create.mockRejectedValue(new Error('database unavailable'));

    await expect(service.createProfileByUserId('u1', { name: 'Ann' })).rejects.toThrow('Внутренняя ошибка сервера');
  });

  it('creates and deletes friends and likes', async () => {
    const prisma = db();
    const account = { getAccountByUserId: createMock().mockResolvedValue({ id: 'p1' }) };
    const friend = new FriendService(prisma as never, account as never);
    const like = new LikeService(prisma as never, account as never, {} as never);
    prisma.friend.findMany.mockResolvedValue([]);
    prisma.friend.upsert.mockResolvedValue({ id: 'f1' });
    prisma.friend.findUnique.mockResolvedValue({ id: 'f1' });
    prisma.friend.delete.mockResolvedValue({ id: 'f1' });
    prisma.like.create.mockResolvedValue({ id: 'l1' });
    prisma.like.findUnique.mockResolvedValue({ id: 'l1' });
    prisma.like.delete.mockResolvedValue({ id: 'l1' });
    prisma.like.findMany.mockResolvedValue([]);
    await expect(friend.getUsersYouFollowByUserId('u1')).resolves.toEqual([]);
    await expect(friend.addFriendByFriendId('u2', { userId: 'u1' })).resolves.toEqual({ id: 'f1' });
    await expect(friend.deleteFriendById('f1')).resolves.toEqual({ id: 'f1' });
    await expect(like.addLike({ activityId: 'a1' })).resolves.toEqual({ id: 'l1' });
    await expect(like.deleteLikeById('l1')).resolves.toEqual({ id: 'l1' });
    await expect(like.getLikesByActivityId('a1')).resolves.toEqual({
      likes: [],
      hasMore: false,
      nextCursor: null,
      currentUserLike: null,
    });
  });

  it('rejects social writes when the author profile is missing', async () => {
    const prisma = db();
    const account = { getAccountByUserId: createMock().mockResolvedValue(null) };
    const friend = new FriendService(prisma as never, account as never);
    const like = new LikeService(prisma as never, account as never, {} as never);
    await expect(friend.addFriendByFriendId('u2', { userId: 'u1' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(like.addLike({ activityId: 'a1' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('activity, comments and statistics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates, updates, reads and deletes activities', async () => {
    const prisma = db();
    const account = {
      getAccountByUserId: createMock().mockResolvedValue({
        id: 'p1',
        name: 'Ann',
        surname: 'Runner',
        profilePhoto: 'avatar',
        profilePhotoBlurhash: null,
        emailNotifications: true,
      }),
    };
    const service = new ActivityService(prisma as never, account as never);
    const queryRaw = createMock();
    Object.assign(prisma, { $queryRaw: queryRaw });
    prisma.activity.create.mockResolvedValue({ id: 'a1' });
    prisma.activity.update.mockResolvedValue({ id: 'a1' });
    const activity = {
      id: 'a1',
      userId: 'u1',
      visibility: 'public',
      routeStorageKey: null,
      kilometresSplit: [],
    };
    prisma.activity.findUnique.mockResolvedValue(activity);
    prisma.activity.findMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
    prisma.activity.delete.mockResolvedValue({ id: 'a1' });
    const dto = makeActivityDto();
    await expect(service.createActivity(dto, 'u1')).resolves.toEqual({ id: 'a1' });
    await expect(service.updateActivity(dto, 'a1')).resolves.toEqual({ id: 'a1' });
    await expect(service.getLocationsByActivityId('a1', 'u1')).resolves.toEqual({
      locations: undefined,
      kilometresSplit: [],
    });
    prisma.activity.findUnique.mockResolvedValue({ ...activity, moderationStatus: 'visible' });
    await expect(service.getActivityByActivityId('a1', 'u1')).resolves.toEqual({
      ...activity,
      elevationGain: 0,
    });
    await expect(service.getActivitesByUserId('u1')).resolves.toEqual({
      activities: [],
      hasMore: false,
      nextCursor: null,
      isLastPage: true,
    });
    await expect(service.getActivitiesByTheirIds('a1')).resolves.toEqual([]);
    await expect(service.getAllActivitiesWithFriends('u1')).resolves.toEqual({
      activities: [],
      currentUserProfile: {
        userId: undefined,
        name: 'Ann',
        surname: 'Runner',
        profilePhoto: 'avatar',
        profilePhotoBlurhash: null,
      },
      hasMore: false,
      nextCursor: null,
      isLastPage: true,
    });
    await expect(service.deleteActivityById('a1')).resolves.toEqual({ id: 'a1' });
  });

  it('updates existing activities by Strava source identity during archive migration', async () => {
    const prisma = db();
    const service = new ActivityService(prisma as never, {} as never);
    const activity = {
      duration: 100,
      distance: 1000,
      speed: 10,
      sport: 'run',
      title: 'Imported activity',
      userId: 'u1',
      profileId: 'p1',
      source: 'strava' as const,
      sourceActivityId: 'strava-activity-1',
    };
    prisma.activity.findMany.mockResolvedValue([
      {
        id: 'activity-existing',
        userId: 'u1',
        sourceActivityId: 'strava-activity-1',
        routeStorageKey: null,
        mapPhotoUrl: null,
      },
    ]);

    await expect(service.createActivitiesFromMigrationArchive([activity])).resolves.toEqual(
      makeMigrationSuccessResult(),
    );
    expect(prisma.activity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_source_sourceActivityId: {
            userId: 'u1',
            source: 'strava',
            sourceActivityId: 'strava-activity-1',
          },
        },
        create: expect.objectContaining({
          id: 'activity-existing',
          ...activity,
          elevationGain: 0,
        }),
        update: expect.objectContaining({ title: 'Imported activity' }),
      }),
    );
  });

  it('creates comments, likes and returns comment collections', async () => {
    const prisma = db();
    const account = { getAccountByUserId: createMock().mockResolvedValue({ id: 'p1' }) };
    const service = new CommentService(prisma as never, account as never, {} as never);
    prisma.activity.findUnique.mockResolvedValue({ comments: [{ id: 'c1' }] });
    prisma.comment.create.mockResolvedValue({ id: 'c1' });
    prisma.comment.update.mockResolvedValue({ id: 'c1' });
    prisma.comment.delete.mockResolvedValue({ id: 'c1' });
    prisma.comment.findUnique.mockResolvedValue({
      authorId: 'author-1',
      moderationStatus: 'visible',
      activity: { id: 'a1' },
      commentLikes: [{ id: 'cl1' }],
    });
    prisma.commentLike.create.mockResolvedValue({ id: 'cl1' });
    prisma.commentLike.findUnique.mockResolvedValue({ id: 'cl1' });
    prisma.commentLike.findMany.mockResolvedValue([{ id: 'cl1' }]);
    prisma.commentLike.delete.mockResolvedValue({ id: 'cl1' });
    await expect(service.getCommentsbyActivityId('a1', '10')).resolves.toEqual({
      comments: [{ id: 'c1', commentLike: [] }],
      hasMore: false,
      nextCursor: null,
    });
    await expect(service.createCommentByActivityId({ comment: 'hello' }, 'a1')).resolves.toBeUndefined();
    await expect(service.updateCommentByCommentId('updated', 'c1')).resolves.toEqual({ id: 'c1' });
    await expect(service.deleteCommentByCommentId('c1')).resolves.toEqual({ id: 'c1' });
    await expect(service.createCommentLikeByCommentId({ commentId: 'c1' })).resolves.toEqual({
      id: 'cl1',
    });
    await expect(service.getCommentLikesLengthByCommentId('c1')).resolves.toEqual([{ id: 'cl1' }]);
    await expect(service.deleteCommentLikeByLikeId('cl1')).resolves.toEqual({ id: 'cl1' });
  });

  it('reduces activity metrics and groups monthly statistics', async () => {
    const prisma = db();
    const queryRaw = createMock();
    Object.assign(prisma, { $queryRaw: queryRaw });
    const service = new StatisticService(prisma as never);
    const activities = makeStatisticActivities();
    prisma.activity.findMany.mockResolvedValue(activities);
    queryRaw.mockResolvedValueOnce([
      { sport: null, ...makeActivityTotals() },
      makeSportActivityTotals('bike'),
      makeSportActivityTotals('run'),
    ]);
    await expect(service.getMonthStatisticsByYearMonth('u1', '2025', '0')).resolves.toMatchObject({
      activitiesReducedBySport: { all: { totalDuration: 300, totalDistance: 3000, totalItems: 2 } },
    });
    queryRaw.mockResolvedValueOnce([makeActivityTotals()]);
    await expect(service.getAllActivitiesStatisticsByUserId('u1')).resolves.toEqual({
      totalDistance: 3000,
      totalDuration: 300,
      totalItems: 2,
    });
    queryRaw.mockResolvedValueOnce([
      { year: 2025, month: 0, sport: 'run', totalDuration: 1, totalDistance: 2, totalItems: 1 },
    ]);
    await expect(service.getStatisticByYearAndCategory('u1')).resolves.toMatchObject({ isUserHasActivities: true });
    queryRaw.mockResolvedValueOnce([]);
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
    expect(getSpeedInMinsInKm(14450, 4331000)).toEqual({ paceAsNumber: 5, paceAsString: '5.00' });
    expect(getSpeedInMinsInKm(1000, 59400)).toEqual({ paceAsNumber: 0.59, paceAsString: '0.59' });
    expect(getSpeedInMinsInKm(1000, 59500)).toEqual({ paceAsNumber: 1, paceAsString: '1.00' });
    expect(getSpeedInMinsInKm(Number.NaN, 60000)).toEqual({ paceAsNumber: 0, paceAsString: '0.00' });
    expect(getSpeedInMinsInKm(1000, Number.POSITIVE_INFINITY)).toEqual({ paceAsNumber: 0, paceAsString: '0.00' });
    expect(getSpeedInMinsInKm(-1000, 60000)).toEqual({ paceAsNumber: 0, paceAsString: '0.00' });
    expect(getSpeedInMinsInKm(1000, -60000)).toEqual({ paceAsNumber: 0, paceAsString: '0.00' });
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
