/* eslint-disable @typescript-eslint/no-explicit-any -- seed repository payloads remain dynamic at this boundary. */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { DatabaseRepositories } from './database-repository';
import { MOCK_EMAIL_PREFIX, MOCK_SEED_VERSION, MOCK_USER_COUNT } from './mock-seed.constants';
import { NOTIFICATION_TYPE } from 'src/notification/notification.constants';
import { seedMockActivities } from './mock-seed-activities';
import { getMockActivityPhotoUrls, loadMockActivityTemplates } from './mock-seed-assets';
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
      profile: { select: { bio: true, name: true, surname: true, profilePhoto: true } },
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
  const activityPhotoUrls = getMockActivityPhotoUrls();
  const seedVersion = `${MOCK_SEED_VERSION}:${activityTemplates.length ? 'routes-v1' : 'generated'}:photos-v1`;
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

    if (isCompleteForVersion(seedVersion)) {
      const notificationTotal = await seedMockNotifications(prisma, target.id, existingMocks);
      if (notificationTotal) logger.log(`Created ${notificationTotal} mock test notifications`);
      return;
    }
  }
  if (existingMocks.length > 0) {
    await prisma.notification.deleteMany({
      where: { recipientUserId: target.id, actorUserId: { in: existingMocks.map((mock: any) => mock.id) } },
    });
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
            profilePhoto: activityPhotoUrls.length
              ? activityPhotoUrls[index % activityPhotoUrls.length]
              : profileImageUrl(index),
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

  const activityStats = await seedMockActivities(prisma, mockUsers, allUsers, activityTemplates, activityPhotoUrls);
  const friendCount = await seedMockFollows(prisma, allUsers);
  const testNotificationTotal = await seedMockNotifications(prisma, target.id, mockUsers);

  await prisma.profile.updateMany({
    where: { userId: { in: mockUsers.map((user) => user.id) } },
    data: { bio: seedVersion },
  });

  logger.log(
    `Created ${mockUsers.length} users, ${activityStats.activityTotal} activities, ${activityStats.commentTotal} comments, ` +
      `${activityStats.activityLikeTotal} activity likes, ${activityStats.commentLikeTotal} comment likes, ` +
      `${friendCount} follows and ${testNotificationTotal} test notifications`,
  );
}

async function seedMockNotifications(prisma: DatabaseRepositories, targetUserId: string, mockUsers: MockUser[]) {
  const targetActivity = await prisma.activity.findFirst({
    where: { userId: targetUserId },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  if (!targetActivity || mockUsers.length < 3) return 0;

  const notifications = [
    { type: NOTIFICATION_TYPE.activityLike, actor: mockUsers[0], content: null },
    { type: NOTIFICATION_TYPE.comment, actor: mockUsers[1], content: 'Классная тренировка! Так держать.' },
    { type: NOTIFICATION_TYPE.commentLike, actor: mockUsers[2], content: 'Ваш комментарий понравился.' },
  ];
  const actorIds = notifications.map(({ actor }) => actor.id);
  const existing = await prisma.notification.findMany({
    where: {
      recipientUserId: targetUserId,
      actorUserId: { in: actorIds },
      type: { in: notifications.map(({ type }) => type) },
    },
    select: { type: true, actorUserId: true },
  });
  if (
    notifications.every(({ type, actor }) =>
      existing.some((notification: any) => notification.type === type && notification.actorUserId === actor.id),
    )
  ) {
    return 0;
  }

  await prisma.notification.deleteMany({
    where: {
      recipientUserId: targetUserId,
      actorUserId: { in: actorIds },
      type: { in: notifications.map(({ type }) => type) },
    },
  });
  const createdAt = Date.now();
  await prisma.notification.createMany({
    data: notifications.map(({ type, actor, content }, index) => ({
      recipientUserId: targetUserId,
      actorUserId: actor.id,
      type,
      sourceId: randomUUID(),
      targetType: 'activity',
      targetId: targetActivity.id,
      actorName: actor.profile?.name,
      actorSurname: actor.profile?.surname,
      actorProfilePhoto: actor.profile?.profilePhoto,
      content,
      inApp: true,
      createdAt: new Date(createdAt - (index + 1) * 15 * 60_000),
    })),
  });
  return notifications.length;
}
