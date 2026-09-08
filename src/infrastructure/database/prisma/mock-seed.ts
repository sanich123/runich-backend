/* eslint-disable @typescript-eslint/no-explicit-any -- repository payloads are intentionally dynamic at this boundary. */
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Logger } from '@nestjs/common';

import type { DatabaseRepositories } from './database-repository';

type AnyRecord = Record<string, any>;

const MOCK_EMAIL_PREFIX = 'runich.mock.runner.';
const MOCK_SEED_VERSION = 'runich-mock-v8';
const MOCK_SEED_IN_PROGRESS = `${MOCK_SEED_VERSION}:in-progress`;
const MOCK_USER_COUNT = 100;
const MAX_MOCK_RELATION_COUNT = 40;
const CREATE_MANY_BATCH_SIZE = 1_000;
const DAY_IN_MS = 86_400_000;
const MINUTE_IN_MS = 60_000;
const TARGET_EMAIL = 'aovoronin.piano@gmail.com';
const TARGET_EMAIL_TYPO = 'aovoronin.piano@gmaill.com';
const logger = new Logger('MockSeed');

const runners = [
  [
    'Eliud',
    'Kipchoge',
    'Kaptagat',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Eliud%20Kipchoge%202018.jpg?width=256',
  ],
  [
    'Kenenisa',
    'Bekele',
    'Addis Ababa',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Kenenisa%20Bekele.jpg?width=256',
  ],
  [
    'Mo',
    'Farah',
    'London',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Mo%20Farah%20Rio%202016.jpg?width=256',
  ],
  [
    'Haile',
    'Gebrselassie',
    'Addis Ababa',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Haile%20Gebrselassie%202009.jpg?width=256',
  ],
  [
    'Faith',
    'Kipyegon',
    'Eldoret',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Faith%20Kipyegon%202023.jpg?width=256',
  ],
  [
    'Sifan',
    'Hassan',
    'Arnhem',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Sifan%20Hassan%202021.jpg?width=256',
  ],
  [
    'Jakob',
    'Ingebrigtsen',
    'Sandnes',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Jakob%20Ingebrigtsen%202022.jpg?width=256',
  ],
  [
    'Brigid',
    'Kosgei',
    'Nairobi',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Brigid%20Kosgei%202019.jpg?width=256',
  ],
  [
    'Tigst',
    'Assefa',
    'Addis Ababa',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Tigst%20Assefa%202023.jpg?width=256',
  ],
  [
    'Kelvin',
    'Kiptum',
    'Chepkorio',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Kelvin%20Kiptum%202023.jpg?width=256',
  ],
  [
    'Ruth',
    'Chepngetich',
    'Nairobi',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Ruth%20Chepngetich%202022.jpg?width=256',
  ],
  [
    'Shelly-Ann',
    'Fraser-Pryce',
    'Kingston',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Shelly-Ann%20Fraser-Pryce%202021.jpg?width=256',
  ],
  [
    'Allyson',
    'Felix',
    'Los Angeles',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Allyson%20Felix%202012.jpg?width=256',
  ],
  [
    'Yulimar',
    'Rojas',
    'Caracas',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Yulimar%20Rojas%202021.jpg?width=256',
  ],
  [
    'Sydney',
    'McLaughlin-Levrone',
    'Los Angeles',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Sydney%20McLaughlin%202021.jpg?width=256',
  ],
  [
    'Genzebe',
    'Dibaba',
    'Addis Ababa',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Genzebe%20Dibaba%202016.jpg?width=256',
  ],
  [
    'Letesenbet',
    'Gidey',
    'Tigray',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Letesenbet%20Gidey%202021.jpg?width=256',
  ],
  [
    'Joshua',
    'Cheptegei',
    'Kampala',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Joshua%20Cheptegei%202021.jpg?width=256',
  ],
  [
    'Yomif',
    'Kejelcha',
    'Addis Ababa',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Yomif%20Kejelcha%202019.jpg?width=256',
  ],
  [
    'Paula',
    'Radcliffe',
    'London',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Paula%20Radcliffe%202007.jpg?width=256',
  ],
] as const;

const activityPhoto = 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=80';
const commentTexts = [
  'Сильная тренировка!',
  'Отличный темп и красивый маршрут.',
  'Так держать!',
  'Вдохновляет на свою пробежку.',
  'Классный результат.',
];

type MockUser = {
  id: string;
  email: string;
  profile?: { id: string; bio?: string | null; [key: string]: unknown } | null;
  [key: string]: any;
};
type SeedUser = { id: string; profile: NonNullable<MockUser['profile']> };

function random(seed: number, max: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.floor((value - Math.floor(value)) * (max + 1));
}

function extractPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (item && typeof item === 'object' && 'url' in item && typeof item.url === 'string') return [item.url];
    return [];
  });
}

function fallbackLocations(userIndex: number, activityIndex: number) {
  const latitude = 55.75 + userIndex / 100;
  const longitude = 37.61 + activityIndex / 100;
  const timestamp = Date.now() - (userIndex * 20 + activityIndex) * 86_400_000;
  return [
    { coords: { latitude, longitude, speed: 3, timestamp } },
    { coords: { latitude: latitude + 0.01, longitude: longitude + 0.01, speed: 3, timestamp: timestamp + 60_000 } },
  ];
}

const stableRunnerPhotos = [3764014, 3763879, 2402777, 3621185, 2774556, 3768114, 2526878, 1128317].map(
  (photoId) =>
    `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=256`,
);

function profileImageUrl(index: number) {
  return stableRunnerPhotos[index % stableRunnerPhotos.length];
}

function mockRunner(index: number) {
  const [baseName, baseSurname, city] = runners[index % runners.length];
  const batch = Math.floor(index / runners.length);
  const suffix = batch === 0 ? '' : ` ${batch + 1}`;

  return { name: `${baseName}${suffix}`, surname: `${baseSurname}${suffix}`, city };
}

function mockActivityCount(userIndex: number) {
  return random(100_000 + userIndex, MAX_MOCK_RELATION_COUNT);
}

async function createManyInBatches<T>(items: T[], createMany: (data: T[]) => Promise<unknown>) {
  for (let offset = 0; offset < items.length; offset += CREATE_MANY_BATCH_SIZE) {
    await createMany(items.slice(offset, offset + CREATE_MANY_BATCH_SIZE));
  }
}

export async function seedMockData(prisma: DatabaseRepositories) {
  const existingMocks = await prisma.user.findMany({
    where: { email: { startsWith: MOCK_EMAIL_PREFIX } },
    select: {
      id: true,
      email: true,
      profile: { select: { bio: true } },
      _count: { select: { activities: true } },
    },
  });

  if (existingMocks.length === MOCK_USER_COUNT) {
    const isComplete = existingMocks.every((mock: any) => {
      const localPart = mock.email.slice(MOCK_EMAIL_PREFIX.length, mock.email.indexOf('@'));
      const userIndex = Number(localPart) - 1;
      return (
        userIndex >= 0 &&
        userIndex < MOCK_USER_COUNT &&
        mock.profile?.bio === MOCK_SEED_VERSION &&
        mock._count.activities === mockActivityCount(userIndex)
      );
    });
    if (isComplete) return;
  }
  if (existingMocks.length > 0) {
    await prisma.user.deleteMany({ where: { email: { startsWith: MOCK_EMAIL_PREFIX } } });
  }

  const target =
    (await prisma.user.findFirst({ where: { email: { in: [TARGET_EMAIL, TARGET_EMAIL_TYPO] } } })) ??
    (await prisma.user.create({
      data: {
        email: TARGET_EMAIL,
        emailConfirmedAt: new Date(),
        profile: {
          create: { email: TARGET_EMAIL, name: 'Alexander', surname: 'Voronin', sport: 'RUNNING', city: 'Moscow' },
        },
      },
    }));

  const targetProfile =
    (await prisma.profile.findUnique({ where: { userId: target.id } })) ??
    (await prisma.profile.create({
      data: {
        userId: target.id,
        email: target.email,
        name: 'Alexander',
        surname: 'Voronin',
        sport: 'RUNNING',
        city: 'Moscow',
      },
    }));

  const sourceActivities = await prisma.activity.findMany({
    where: { userId: target.id },
    select: { photoVideoUrls: true, mapPhotoUrl: true, locations: true, kilometresSplit: true },
    orderBy: { date: 'desc' },
  });
  const sourcePhotoUrls = sourceActivities.flatMap((activity: any) => [
    ...extractPhotoUrls(activity.photoVideoUrls),
    ...(activity.mapPhotoUrl ? [activity.mapPhotoUrl] : []),
  ]);

  const password = await bcrypt.hash('RunichMock123!', 10);
  const mockUsers: MockUser[] = [];

  for (let index = 0; index < MOCK_USER_COUNT; index += 1) {
    const { name, surname, city } = mockRunner(index);
    const email = `${MOCK_EMAIL_PREFIX}${String(index + 1).padStart(3, '0')}@runich.app`;
    const user = await prisma.user.create({
      data: {
        email,
        encryptedPassword: password,
        emailConfirmedAt: new Date(),
        profile: {
          create: {
            email,
            name,
            surname,
            city,
            weight: String(52 + random(index + 1, 38)),
            birthday: new Date(1985 + (index % 15), index % 12, 1 + (index % 25)),
            gender: index % 2 === 0 ? 'MALE' : 'FEMALE',
            sport: 'RUNNING',
            language: 'en',
            bio: MOCK_SEED_IN_PROGRESS,
            profilePhoto: profileImageUrl(index),
            emailNotifications: false,
          },
        },
      },
      include: { profile: true },
    });
    if (!user.profile) throw new Error(`Не удалось создать профиль тестового пользователя: ${email}`);
    mockUsers.push(user);
  }

  const allUsers: SeedUser[] = [
    { id: target.id, profile: targetProfile },
    ...mockUsers.map((user) => ({ id: user.id, profile: user.profile! })),
  ];

  let activityTotal = 0;
  let commentTotal = 0;
  let activityLikeTotal = 0;
  let commentLikeTotal = 0;

  for (const [userIndex, user] of mockUsers.entries()) {
    const profile = user.profile!;
    const activityCount = mockActivityCount(userIndex);
    const activityRows: AnyRecord[] = [];

    for (let activityIndex = 0; activityIndex < activityCount; activityIndex += 1) {
      const sourceActivity = sourceActivities.length
        ? sourceActivities[activityIndex % sourceActivities.length]
        : undefined;
      const photo = sourcePhotoUrls.length
        ? sourcePhotoUrls[(userIndex * MAX_MOCK_RELATION_COUNT + activityIndex) % sourcePhotoUrls.length]
        : activityPhoto;

      activityRows.push({
        id: randomUUID(),
        userId: user.id,
        profileId: profile.id,
        title: `${['Morning run', 'Tempo run', 'Long run', 'Recovery run'][activityIndex % 4]} #${activityIndex + 1}`,
        description: 'Mock activity for the Runich feed',
        sport: ['run', 'walk', 'ride'][(userIndex * MAX_MOCK_RELATION_COUNT + activityIndex) % 3],
        distance: 5000 + random((userIndex + 1) * 100 + activityIndex, 25000),
        duration: 1500 + random((userIndex + 1) * 200 + activityIndex, 9000),
        speed: 8 + random((userIndex + 1) * 300 + activityIndex, 8),
        date: new Date(
          Date.now() - (userIndex * MAX_MOCK_RELATION_COUNT + activityIndex + MAX_MOCK_RELATION_COUNT) * DAY_IN_MS,
        ),
        emotion: ['ENERGETIC', 'HAPPY', 'CALM'][activityIndex % 3],
        isPublic: true,
        photoVideoUrls: [{ url: photo, thumbnail: photo }],
        locations: sourceActivity?.locations ? sourceActivity.locations : fallbackLocations(userIndex, activityIndex),
        kilometresSplit: sourceActivity?.kilometresSplit
          ? sourceActivity.kilometresSplit
          : [
              { kilometre: 1, pace: 280 + random(userIndex + activityIndex, 45) },
              { kilometre: 2, pace: 285 + random(userIndex + activityIndex + 20, 45) },
            ],
      });
    }

    await createManyInBatches(activityRows, (data) => prisma.activity.createMany({ data }));
    activityTotal += activityRows.length;

    for (const [activityIndex, activity] of activityRows.entries()) {
      const activityDate = new Date(activity.date ?? Date.now());
      const activityLikeRows: AnyRecord[] = [];
      const commentRows: AnyRecord[] = [];
      const commentLikeRows: AnyRecord[] = [];
      const activityLikeCount = random((userIndex + 1) * 20_000 + activityIndex, MAX_MOCK_RELATION_COUNT);

      for (let likeIndex = 0; likeIndex < activityLikeCount; likeIndex += 1) {
        const liker = allUsers[(likeIndex + userIndex + activityIndex + 1) % allUsers.length];
        activityLikeRows.push({
          id: randomUUID(),
          activityId: activity.id!,
          profileId: liker.profile.id,
          authorId: liker.id,
          date: new Date(activityDate.getTime() + (likeIndex + 1) * MINUTE_IN_MS),
        });
      }

      const commentCount = random((userIndex + 1) * 1000 + activityIndex, MAX_MOCK_RELATION_COUNT);
      for (let commentIndex = 0; commentIndex < commentCount; commentIndex += 1) {
        const author = allUsers[(userIndex + activityIndex + commentIndex + 1) % allUsers.length];
        const commentId = randomUUID();
        const commentDate = new Date(activityDate.getTime() + (commentIndex + 1) * 15 * MINUTE_IN_MS);

        commentRows.push({
          id: commentId,
          date: commentDate,
          activityId: activity.id!,
          profileId: author.profile.id,
          authorId: author.id,
          comment: commentTexts[(userIndex + activityIndex + commentIndex) % commentTexts.length],
        });

        const commentLikeCount = random(
          (userIndex + 1) * 10_000 + activityIndex * MAX_MOCK_RELATION_COUNT + commentIndex,
          MAX_MOCK_RELATION_COUNT,
        );
        for (let likeIndex = 0; likeIndex < commentLikeCount; likeIndex += 1) {
          const liker = allUsers[(likeIndex + commentIndex + activityIndex + userIndex + 1) % allUsers.length];
          commentLikeRows.push({
            id: randomUUID(),
            date: new Date(commentDate.getTime() + (likeIndex + 1) * MINUTE_IN_MS),
            commentId,
            profileId: liker.profile.id,
            authorId: liker.id,
          });
        }
      }

      await createManyInBatches(activityLikeRows, (data) => prisma.like.createMany({ data }));
      await createManyInBatches(commentRows, (data) => prisma.comment.createMany({ data }));
      await createManyInBatches(commentLikeRows, (data) => prisma.commentLike.createMany({ data }));
      activityLikeTotal += activityLikeRows.length;
      commentTotal += commentRows.length;
      commentLikeTotal += commentLikeRows.length;
    }
  }

  const usersById = new Map(allUsers.map((user) => [user.id, user]));
  const followerCapacity = new Map(
    allUsers.map((user, userIndex) => [user.id, random(600_000 + userIndex, MAX_MOCK_RELATION_COUNT)]),
  );
  const friendRows: AnyRecord[] = [];

  for (const [userIndex, user] of allUsers.entries()) {
    const followCount = random(500_000 + userIndex, MAX_MOCK_RELATION_COUNT);
    const followedIds = new Set<string>();

    for (let offset = 1; offset <= allUsers.length && followedIds.size < followCount; offset += 1) {
      const candidate = allUsers[(userIndex + offset) % allUsers.length];
      const capacity = followerCapacity.get(candidate.id) ?? 0;
      if (candidate.id !== user.id && capacity > 0) {
        followedIds.add(candidate.id);
        followerCapacity.set(candidate.id, capacity - 1);
      }
    }

    for (const friendId of followedIds) {
      const friend = usersById.get(friendId);
      if (!friend) throw new Error(`Не найден профиль тестового пользователя: ${friendId}`);
      friendRows.push({ id: randomUUID(), userId: user.id, friendId, profileId: friend.profile.id });
    }
  }

  await createManyInBatches(friendRows, (data) => prisma.friend.createMany({ data }));

  await prisma.profile.updateMany({
    where: { userId: { in: mockUsers.map((user) => user.id) } },
    data: { bio: MOCK_SEED_VERSION },
  });

  logger.log(
    `Created ${mockUsers.length} users, ${activityTotal} activities, ${commentTotal} comments, ` +
      `${activityLikeTotal} activity likes, ${commentLikeTotal} comment likes and ${friendRows.length} follows`,
  );
}
