import * as bcrypt from 'bcrypt';

import { Prisma, PrismaClient } from '../generated/prisma/client';

const MOCK_EMAIL_PREFIX = 'runich.mock.runner.';
const MOCK_SEED_VERSION = 'runich-mock-v5';
const TARGET_EMAIL = 'aovoronin.piano@gmail.com';
const TARGET_EMAIL_TYPO = 'aovoronin.piano@gmaill.com';

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

type MockUser = Prisma.UsersGetPayload<{ include: { profile: true } }>;
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

export async function seedMockData(prisma: PrismaClient) {
  const existingMocks = await prisma.users.findMany({
    where: { email: { startsWith: MOCK_EMAIL_PREFIX } },
    select: {
      id: true,
      profile: { select: { bio: true } },
      _count: { select: { activities: true } },
    },
  });

  if (existingMocks.length === runners.length) {
    const isComplete = existingMocks.every(
      (mock) => mock.profile?.bio === MOCK_SEED_VERSION && mock._count.activities === 20,
    );
    if (isComplete) return;
  }
  if (existingMocks.length > 0) {
    await prisma.users.deleteMany({ where: { email: { startsWith: MOCK_EMAIL_PREFIX } } });
  }

  const target =
    (await prisma.users.findFirst({ where: { email: { in: [TARGET_EMAIL, TARGET_EMAIL_TYPO] } } })) ??
    (await prisma.users.create({
      data: {
        email: TARGET_EMAIL,
        email_confirmed_at: new Date(),
        profile: {
          create: { email: TARGET_EMAIL, name: 'Alexander', surname: 'Voronin', sport: 'RUNNING', city: 'Moscow' },
        },
      },
    }));

  const targetProfile =
    (await prisma.profile.findUnique({ where: { user_id: target.id } })) ??
    (await prisma.profile.create({
      data: {
        user_id: target.id,
        email: target.email,
        name: 'Alexander',
        surname: 'Voronin',
        sport: 'RUNNING',
        city: 'Moscow',
      },
    }));

  const sourceActivities = await prisma.activity.findMany({
    where: { user_id: target.id },
    select: { photoVideoUrls: true, mapPhotoUrl: true, locations: true, kilometresSplit: true },
    orderBy: { date: 'desc' },
  });
  const sourcePhotoUrls = sourceActivities.flatMap((activity) => [
    ...extractPhotoUrls(activity.photoVideoUrls),
    ...(activity.mapPhotoUrl ? [activity.mapPhotoUrl] : []),
  ]);

  const password = await bcrypt.hash('RunichMock123!', 10);
  const mockUsers: MockUser[] = [];

  for (const [index, [name, surname, city]] of runners.entries()) {
    const email = `${MOCK_EMAIL_PREFIX}${String(index + 1).padStart(2, '0')}@runich.app`;
    const user = await prisma.users.create({
      data: {
        email,
        encrypted_password: password,
        email_confirmed_at: new Date(),
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
            bio: MOCK_SEED_VERSION,
            profilePhoto: profileImageUrl(index),
            emailNotifications: false,
          },
        },
      },
      include: { profile: true },
    });
    if (!user.profile) throw new Error(`Could not create profile for mock user ${email}`);
    mockUsers.push(user);
  }

  const allUsers: SeedUser[] = [
    { id: target.id, profile: targetProfile },
    ...mockUsers.map((user) => ({ id: user.id, profile: user.profile! })),
  ];

  for (const [userIndex, user] of mockUsers.entries()) {
    const profile = user.profile!;
    for (let activityIndex = 0; activityIndex < 20; activityIndex += 1) {
      const activity = await prisma.activity.create({
        data: {
          user_id: user.id,
          profileId: profile.id,
          title: `${['Morning run', 'Tempo run', 'Long run', 'Recovery run'][activityIndex % 4]} #${activityIndex + 1}`,
          description: 'Mock activity for the Runich feed',
          sport: ['run', 'walk', 'ride'][(userIndex * 20 + activityIndex) % 3],
          distance: 5000 + random((userIndex + 1) * 100 + activityIndex, 25000),
          duration: 1500 + random((userIndex + 1) * 200 + activityIndex, 9000),
          speed: 8 + random((userIndex + 1) * 300 + activityIndex, 8),
          date: new Date(Date.now() - (userIndex * 20 + activityIndex) * 86_400_000),
          emotion: ['ENERGETIC', 'HAPPY', 'CALM'][activityIndex % 3],
          isPublic: true,
          photoVideoUrls: (() => {
            const photo = sourcePhotoUrls.length
              ? sourcePhotoUrls[(userIndex * 20 + activityIndex) % sourcePhotoUrls.length]
              : activityPhoto;
            return [{ url: photo, thumbnail: photo }];
          })(),
          locations:
            sourceActivities.length && sourceActivities[activityIndex % sourceActivities.length].locations
              ? (sourceActivities[activityIndex % sourceActivities.length].locations as Prisma.InputJsonValue)
              : fallbackLocations(userIndex, activityIndex),
          kilometresSplit:
            sourceActivities.length && sourceActivities[activityIndex % sourceActivities.length].kilometresSplit
              ? (sourceActivities[activityIndex % sourceActivities.length].kilometresSplit as Prisma.InputJsonValue)
              : [
                  { kilometre: 1, pace: 280 + random(userIndex + activityIndex, 45) },
                  { kilometre: 2, pace: 285 + random(userIndex + activityIndex + 20, 45) },
                ],
        },
      });

      const activityLikeCount = random((userIndex + 1) * 20_000 + activityIndex, 20);
      for (let likeIndex = 0; likeIndex < activityLikeCount; likeIndex += 1) {
        const liker = allUsers[(likeIndex + userIndex + activityIndex + 1) % allUsers.length];
        await prisma.like.create({
          data: { activityId: activity.id, profileId: liker.profile.id, authorId: liker.id },
        });
      }

      const commentCount = random((userIndex + 1) * 1000 + activityIndex, 20);
      for (let commentIndex = 0; commentIndex < commentCount; commentIndex += 1) {
        const author = allUsers[(userIndex + activityIndex + commentIndex + 1) % allUsers.length];
        const comment = await prisma.comment.create({
          data: {
            activityId: activity.id,
            profileId: author.profile!.id,
            authorId: author.id,
            comment: commentTexts[(userIndex + activityIndex + commentIndex) % commentTexts.length],
          },
        });
        const likeCount = random((userIndex + 1) * 10_000 + activityIndex * 100 + commentIndex, 10);
        for (let likeIndex = 0; likeIndex < likeCount; likeIndex += 1) {
          const liker = allUsers[(likeIndex + commentIndex + activityIndex + 1) % allUsers.length];
          await prisma.commentLike.create({
            data: { commentId: comment.id, profileId: liker.profile!.id, authorId: liker.id },
          });
        }
      }
    }
  }

  for (const [userIndex, user] of mockUsers.entries()) {
    const followIds = new Set<string>([target.id]);
    const followCount = random(userIndex + 500, 15);
    for (let offset = 0; followIds.size < followCount + 1; offset += 1) {
      const candidate = mockUsers[(userIndex + offset + 1) % mockUsers.length];
      if (candidate.id !== user.id) followIds.add(candidate.id);
    }
    for (const friendId of followIds) {
      const friendProfile =
        friendId === target.id ? targetProfile : mockUsers.find((item) => item.id === friendId)!.profile!;
      await prisma.friend.create({ data: { user_id: user.id, friendId, profileId: friendProfile.id } });
    }
  }

  for (const user of mockUsers.slice(0, 10)) {
    await prisma.friend.create({ data: { user_id: target.id, friendId: user.id, profileId: user.profile!.id } });
  }

  console.log(`[Mock seed] created ${mockUsers.length} users, ${mockUsers.length * 20} activities`);
}
