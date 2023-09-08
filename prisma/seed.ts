import { PrismaClient } from '@prisma/client';
import {
  USER1_ACTIVITY,
  USER1_PROFILE,
  USER1_PROFILE_INFO,
  USER2_ACTIVITY,
  USER2_PROFILE,
  USER2_PROFILE_INFO,
  USER3_ACTIVITY,
  USER3_PROFILE,
  USER3_PROFILE_INFO,
  USER4_ACTIVITY,
  USER4_PROFILE,
  USER4_PROFILE_INFO,
  USER5_ACTIVITY,
  USER5_PROFILE,
  USER5_PROFILE_INFO,
} from '../src/utils/mocks';
import { v4 } from 'uuid';

const prisma = new PrismaClient();
async function main() {
  const id1 = v4();
  const id2 = v4();
  const id3 = v4();
  const id4 = v4();
  const id5 = v4();
  const id6 = v4();

  const user1 = await prisma.user.upsert({
    where: { id: id1 },
    update: {},
    create: {
      ...USER1_PROFILE_INFO,
      friends: {
        create: [{ friendId: id3 }, { friendId: id2 }],
      },
      profile: {
        create: USER1_PROFILE,
      },
    },
  });

  const user2 = await prisma.user.upsert({
    where: { id: id2 },
    update: {},
    create: {
      ...USER2_PROFILE_INFO,
      friends: {
        create: [{ friendId: id3 }],
      },
      profile: {
        create: USER2_PROFILE,
      },
      activity: {
        create: USER2_ACTIVITY,
      },
    },
  });

  const user3 = await prisma.user.upsert({
    where: { id: id3 },
    update: {},
    create: {
      ...USER3_PROFILE_INFO,
      friends: {
        create: [{ friendId: id1 }, { friendId: id2 }],
      },
      profile: {
        create: USER3_PROFILE,
      },
      activity: {
        create: USER3_ACTIVITY,
      },
    },
  });

  const user4 = await prisma.user.upsert({
    where: { id: id4 },
    update: {},
    create: {
      ...USER4_PROFILE_INFO,
      friends: {
        create: [{ friendId: id1 }, { friendId: id2 }],
      },
      profile: {
        create: USER4_PROFILE,
      },
      activity: {
        create: USER4_ACTIVITY,
      },
    },
  });

  const user5 = await prisma.user.upsert({
    where: { id: id5 },
    update: {},
    create: {
      ...USER5_PROFILE_INFO,
      friends: {
        create: [{ friendId: id3 }, { friendId: id4 }],
      },
      profile: {
        create: USER5_PROFILE,
      },
      activity: {
        create: USER5_ACTIVITY,
      },
    },
  });

  const activity1 = await prisma.activity.upsert({
    where: { id: id6 },
    update: {},
    create: {
      userId: user1.id,
      ...USER1_ACTIVITY,
    },
  });

  const likesToActivity1 = await prisma.like.createMany({
    data: [
      {
        activityId: activity1.id,
        authorId: user2.id,
      },
      { activityId: activity1.id, authorId: user3.id },
    ],
  });

  const commentsToActivity1 = await prisma.comment.createMany({
    data: [
      {
        activityId: activity1.id,
        authorId: user2.id,
        comment: 'How are you, Courtney?',
      },
      {
        activityId: activity1.id,
        authorId: user1.id,
        comment: 'I am fine, Eliud! And what about you?',
      },
      {
        activityId: activity1.id,
        authorId: user2.id,
        comment: 'I am too. What about long run on Sunday in Kenya? I will pace you!',
      },
      {
        activityId: activity1.id,
        authorId: user1.id,
        comment: 'Oh, I do not know exactly, maybe yes, maybe no. See you',
      },
    ],
  });
  console.log(user1, activity1, likesToActivity1, commentsToActivity1, user4, user5);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
