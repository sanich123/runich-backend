import { PrismaClient } from '@prisma/client';
import {
  KIPCHOGE_ACTIVITY,
  JORNET_ACTIVITY,
  FARAH_ACTIVITY,
  HAILE_ACTIVITY,
  DAUWALTER_ACTIVITY,
  BEKELE_ACTIVITY,
} from '../src/utils/mocks/activities';
import {
  BEKELE_PROFILE_INFO,
  DAUWALTER_PROFILE_INFO,
  FARAH_PROFILE_INFO,
  HAILE_PROFILE_INFO,
  JORNET_PROFILE_INFO,
  KIPCHOGE_PROFILE_INFO,
} from '../src/utils/mocks/profiles-info';
import {
  BEKELE_PROFILE,
  DAUWALTER_PROFILE,
  FARAH_PROFILE,
  HAILE_PROFILE,
  JORNET_PROFILE,
  KIPCHOGE_PROFILE,
} from '../src/utils/mocks/profiles';
import { getIds } from '../src/utils/mocks/getIds';

const prisma = new PrismaClient();

async function main() {
  const {
    courtneyDauwalterId,
    eliudKipchogeId,
    kilianJornetId,
    moFarahId,
    haileGebrselassieId,
    kenenisaBekeleId,
    dauwalterActivityId,
    kipchogeActivityId,
    farahActivityId,
    jornetActivityId,
    bekeleActivityId,
    haileActivityId,
  } = getIds();

  const courtneyDauwalter = await prisma.user.upsert({
    where: { id: courtneyDauwalterId },
    update: {},
    create: {
      ...DAUWALTER_PROFILE_INFO,
      profile: { create: DAUWALTER_PROFILE },
    },
  });

  const eliudKipchoge = await prisma.user.upsert({
    where: { id: eliudKipchogeId },
    update: {},
    create: {
      ...KIPCHOGE_PROFILE_INFO,
      profile: { create: KIPCHOGE_PROFILE },
      activity: { create: KIPCHOGE_ACTIVITY },
    },
  });

  const kilianJornet = await prisma.user.upsert({
    where: { id: kilianJornetId },
    update: {},
    create: {
      ...JORNET_PROFILE_INFO,
      profile: { create: JORNET_PROFILE },
      activity: { create: JORNET_ACTIVITY },
    },
  });

  const moFarah = await prisma.user.upsert({
    where: { id: moFarahId },
    update: {},
    create: {
      ...FARAH_PROFILE_INFO,
      profile: { create: FARAH_PROFILE },
      activity: { create: FARAH_ACTIVITY },
    },
  });

  const haileGebrselassie = await prisma.user.upsert({
    where: { id: haileGebrselassieId },
    update: {},
    create: {
      ...HAILE_PROFILE_INFO,
      profile: { create: HAILE_PROFILE },
      activity: { create: HAILE_ACTIVITY },
    },
  });

  const kenenisaBekele = await prisma.user.upsert({
    where: { id: kenenisaBekeleId },
    update: {},
    create: {
      ...BEKELE_PROFILE_INFO,
      profile: { create: BEKELE_PROFILE },
      activity: { create: BEKELE_ACTIVITY },
    },
  });

  const dauwalterActivity = await prisma.activity.upsert({
    where: { id: dauwalterActivityId },
    update: {},
    create: {
      userId: courtneyDauwalter.id,
      ...DAUWALTER_ACTIVITY,
    },
  });

  const likesDauwalterActivity = await prisma.like.createMany({
    data: [
      { activityId: dauwalterActivity.id, authorId: eliudKipchoge.id },
      { activityId: dauwalterActivity.id, authorId: kilianJornet.id },
      { activityId: dauwalterActivity.id, authorId: kenenisaBekele.id },
    ],
  });

  const commentsDauwalterActivity = await prisma.comment.createMany({
    data: [
      {
        activityId: dauwalterActivity.id,
        authorId: eliudKipchoge.id,
        comment: 'How are you, Courtney?',
      },
      {
        activityId: dauwalterActivity.id,
        authorId: courtneyDauwalter.id,
        comment: 'I am fine, Eliud! And what about you?',
      },
      {
        activityId: dauwalterActivity.id,
        authorId: eliudKipchoge.id,
        comment: 'I am too. What about long run on Sunday in Kenya? I will pace you!',
      },
      {
        activityId: dauwalterActivity.id,
        authorId: courtneyDauwalter.id,
        comment: 'Oh, I do not know exactly, maybe yes, maybe no. See you',
      },
    ],
  });

  const friendsOfDauwalter = await prisma.friend.createMany({
    data: [
      { userId: courtneyDauwalter.id, friendId: eliudKipchoge.id },
      { userId: courtneyDauwalter.id, friendId: kilianJornet.id },
      { userId: courtneyDauwalter.id, friendId: moFarah.id },
    ],
  });

  const kipchogeActivity = await prisma.activity.upsert({
    where: { id: kipchogeActivityId },
    update: {},
    create: {
      userId: eliudKipchoge.id,
      ...KIPCHOGE_ACTIVITY,
    },
  });

  const likesKipchogeActivity = await prisma.like.createMany({
    data: [
      { activityId: kipchogeActivity.id, authorId: courtneyDauwalter.id },
      { activityId: kipchogeActivity.id, authorId: haileGebrselassie.id },
      { activityId: kipchogeActivity.id, authorId: moFarah.id },
    ],
  });

  const commentsKipchogeActivity = await prisma.comment.createMany({
    data: [
      {
        activityId: kipchogeActivity.id,
        authorId: kilianJornet.id,
        comment: 'Привет, Кипчоге!',
      },
      {
        activityId: kipchogeActivity.id,
        authorId: eliudKipchoge.id,
        comment: 'И тебе не хворать, родной',
      },
      {
        activityId: kipchogeActivity.id,
        authorId: kilianJornet.id,
        comment: 'Когда новый рекорд поставишь?',
      },
      {
        activityId: kipchogeActivity.id,
        authorId: eliudKipchoge.id,
        comment: 'Да хер его знает, чет пока не бегается',
      },
    ],
  });

  const friendsOfKipchoge = await prisma.friend.createMany({
    data: [
      { userId: eliudKipchoge.id, friendId: courtneyDauwalter.id },
      { userId: eliudKipchoge.id, friendId: kilianJornet.id },
      { userId: eliudKipchoge.id, friendId: moFarah.id },
    ],
  });

  const jornetActivity = await prisma.activity.upsert({
    where: { id: jornetActivityId },
    update: {},
    create: {
      userId: kilianJornet.id,
      ...JORNET_ACTIVITY,
    },
  });
  const likesJornetActivity = await prisma.like.createMany({
    data: [
      { activityId: jornetActivity.id, authorId: kenenisaBekele.id },
      { activityId: jornetActivity.id, authorId: courtneyDauwalter.id },
      { activityId: jornetActivity.id, authorId: moFarah.id },
    ],
  });

  const commentsJornetActivity = await prisma.comment.createMany({
    data: [
      {
        activityId: jornetActivity.id,
        authorId: kenenisaBekele.id,
        comment: 'Здарова, заебал',
      },
      {
        activityId: jornetActivity.id,
        authorId: kilianJornet.id,
        comment: 'Че дерзишь, пес',
      },
      {
        activityId: jornetActivity.id,
        authorId: kenenisaBekele.id,
        comment: 'А че ты мне сделаешь?',
      },
      {
        activityId: jornetActivity.id,
        authorId: kilianJornet.id,
        comment:
          'Я могу на Эверест забежать за 18 часов, как ты думаешь, смогу ли я тебе ввалить пиздюлей? Мне кажется очень даже смогу. Но на трейле. На шоссе конечно ты меня обгонишь, сучонок',
      },
    ],
  });
  const friendsOfJornet = await prisma.friend.createMany({
    data: [
      { userId: kilianJornet.id, friendId: courtneyDauwalter.id },
      { userId: kilianJornet.id, friendId: haileGebrselassie.id },
      { userId: kilianJornet.id, friendId: moFarah.id },
      { userId: kilianJornet.id, friendId: kenenisaBekele.id },
    ],
  });

  const friendsOfFarah = await prisma.friend.createMany({
    data: [
      { userId: moFarah.id, friendId: courtneyDauwalter.id },
      { userId: moFarah.id, friendId: haileGebrselassie.id },
      { userId: moFarah.id, friendId: kilianJornet.id },
      { userId: moFarah.id, friendId: kenenisaBekele.id },
    ],
  });

  const friendsOfHaile = await prisma.friend.createMany({
    data: [
      { userId: haileGebrselassie.id, friendId: courtneyDauwalter.id },
      { userId: haileGebrselassie.id, friendId: moFarah.id },
      { userId: haileGebrselassie.id, friendId: kilianJornet.id },
      { userId: haileGebrselassie.id, friendId: kenenisaBekele.id },
    ],
  });

  const friendsOfBekele = await prisma.friend.createMany({
    data: [
      { userId: kenenisaBekele.id, friendId: courtneyDauwalter.id },
      { userId: kenenisaBekele.id, friendId: moFarah.id },
      { userId: kenenisaBekele.id, friendId: kilianJornet.id },
      { userId: kenenisaBekele.id, friendId: haileGebrselassie.id },
    ],
  });
  const farahActivity = await prisma.activity.upsert({
    where: { id: farahActivityId },
    update: {},
    create: {
      userId: moFarah.id,
      ...FARAH_ACTIVITY,
    },
  });

  const haileActivity = await prisma.activity.upsert({
    where: { id: haileActivityId },
    update: {},
    create: {
      userId: haileGebrselassie.id,
      ...HAILE_ACTIVITY,
    },
  });

  const bekeleActivity = await prisma.activity.upsert({
    where: { id: bekeleActivityId },
    update: {},
    create: {
      userId: kenenisaBekele.id,
      ...BEKELE_ACTIVITY,
    },
  });

  console.log(
    courtneyDauwalter,
    eliudKipchoge,
    kilianJornet,
    moFarah,
    haileGebrselassie,
    kenenisaBekele,
    dauwalterActivity,
    kipchogeActivity,
    jornetActivity,
    farahActivity,
    haileActivity,
    bekeleActivity,
    likesDauwalterActivity,
    commentsDauwalterActivity,
    friendsOfDauwalter,
    friendsOfKipchoge,
    friendsOfJornet,
    friendsOfFarah,
    friendsOfHaile,
    friendsOfBekele,
    likesKipchogeActivity,
    commentsKipchogeActivity,
    likesJornetActivity,
    commentsJornetActivity,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
