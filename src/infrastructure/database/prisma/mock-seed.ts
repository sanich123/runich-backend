/* eslint-disable @typescript-eslint/no-explicit-any -- seed repository payloads remain dynamic at this boundary. */
import * as bcrypt from 'bcrypt';
import { Logger } from '@nestjs/common';
import type { DatabaseRepositories } from './database-repository';
import { MOCK_EMAIL_PREFIX, MOCK_SEED_VERSION, MOCK_USER_COUNT } from './mock-seed.constants';
import { seedMockActivities } from './mock-seed-activities';
import { loadMockActivityTemplates } from './mock-seed-assets';
import { seedMockFollows } from './mock-seed-follows';
import {
  mockActivityCount,
  mockProfilePrivacySettingsForIndex,
  mockRunner,
  profileImageUrl,
  random,
} from './mock-seed.helpers';
import type { MockUser, SeedUser } from './mock-seed.types';
export { mockProfilePrivacySettingsForIndex } from './mock-seed.helpers';

const TARGET_EMAIL = 'aovoronin.piano@gmail.com';
const TARGET_EMAIL_TYPO = 'aovoronin.piano@gmaill.com';
const logger = new Logger('MockSeed');

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

  const existingTarget = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  const typoTarget = existingTarget ? null : await prisma.user.findUnique({ where: { email: TARGET_EMAIL_TYPO } });
  const configuredTargetPassword = process.env.MOCK_SEED_TARGET_PASSWORD?.trim();
  let target = existingTarget;
  if (!target && typoTarget) {
    target = await prisma.user.update({ where: { id: typoTarget.id }, data: { email: TARGET_EMAIL } });
  }
  if (!target) {
    if (!configuredTargetPassword) {
      throw new Error('MOCK_SEED_TARGET_PASSWORD is required to create the target account');
    }
    target = await prisma.user.create({
      data: {
        email: TARGET_EMAIL,
        encryptedPassword: await bcrypt.hash(configuredTargetPassword, 10),
        emailConfirmedAt: new Date(),
        profile: {
          create: {
            email: TARGET_EMAIL,
            name: 'Alexander',
            surname: 'Voronin',
            sport: 'RUNNING',
            city: 'Moscow',
          },
        },
      },
    });
  }

  const activityTemplates = await loadMockActivityTemplates();
  const seedVersion = `${MOCK_SEED_VERSION}:${activityTemplates.length ? 'routes-v1' : 'generated'}`;
  const seedInProgress = `${seedVersion}:in-progress`;

  if (existingMocks.length === MOCK_USER_COUNT) {
    const isCompleteForVersion = (version: string) =>
      existingMocks.every((mock: any) => {
        const localPart = mock.email.slice(MOCK_EMAIL_PREFIX.length, mock.email.indexOf('@'));
        const userIndex = Number(localPart) - 1;
        return (
          userIndex >= 0 &&
          userIndex < MOCK_USER_COUNT &&
          mock.profile?.bio === version &&
          mock._count.activities === mockActivityCount(userIndex)
        );
      });

    if (isCompleteForVersion(seedVersion)) return;
  }
  if (existingMocks.length > 0) {
    await prisma.user.deleteMany({ where: { email: { startsWith: MOCK_EMAIL_PREFIX } } });
  }

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
            bio: seedInProgress,
            profilePhoto: profileImageUrl(index),
            emailNotifications: false,
            ...mockProfilePrivacySettingsForIndex(index),
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

  const activityStats = await seedMockActivities(prisma, mockUsers, allUsers, activityTemplates);
  const friendCount = await seedMockFollows(prisma, allUsers);

  await prisma.profile.updateMany({
    where: { userId: { in: mockUsers.map((user) => user.id) } },
    data: { bio: seedVersion },
  });

  logger.log(
    `Created ${mockUsers.length} users, ${activityStats.activityTotal} activities, ${activityStats.commentTotal} comments, ` +
      `${activityStats.activityLikeTotal} activity likes, ${activityStats.commentLikeTotal} comment likes and ${friendCount} follows`,
  );
}
