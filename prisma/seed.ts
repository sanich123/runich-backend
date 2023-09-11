import { PrismaClient } from '@prisma/client';
import {
  KIPCHOGE_ACTIVITY,
  JORNET_ACTIVITY,
  FARAH_ACTIVITY,
  HAILE_ACTIVITY,
  DAUWALTER_ACTIVITY,
  BEKELE_ACTIVITY,
  WALMSLEY_ACTIVITY,
  KISELEV_ACTIVITY,
  MITYAEV_ACTIVITY,
} from '../src/utils/mocks/activities';

import { getIds } from '../src/utils/mocks/getIds';
import {
  createCourtneyDownwalter,
  createDmitryMityaev,
  createEliudKipchoge,
  createHaileGebreselassie,
  createJimWalmsley,
  createKenenisiBekele,
  createKilianJornet,
  createMoFarah,
  createStepanKiselev,
} from '../src/utils/mocks/create-mocks-functions';

const prisma = new PrismaClient();

async function main() {
  const {
    dauwalterActivityId,
    kipchogeActivityId,
    farahActivityId,
    jornetActivityId,
    bekeleActivityId,
    haileActivityId,
    jimWalmsleyActivityId,
    stepanKiselevActivityId,
    dmitryMityaevActivityId,
  } = getIds();

  const courtneyDauwalter = await createCourtneyDownwalter();
  const eliudKipchoge = await createEliudKipchoge();
  const kilianJornet = await createKilianJornet();
  const moFarah = await createMoFarah();
  const haileGebrselassie = await createHaileGebreselassie();
  const kenenisaBekele = await createKenenisiBekele();
  const jimWalmsley = await createJimWalmsley();
  const stepanKiselev = await createStepanKiselev();
  const dmitryMityaev = await createDmitryMityaev();

  //Activities

  const dauwalterActivity = await prisma.activity.upsert({
    where: { id: dauwalterActivityId },
    update: {},
    create: {
      userId: courtneyDauwalter.id,
      ...DAUWALTER_ACTIVITY,
    },
  });

  const kipchogeActivity = await prisma.activity.upsert({
    where: { id: kipchogeActivityId },
    update: {},
    create: {
      userId: eliudKipchoge.id,
      ...KIPCHOGE_ACTIVITY,
    },
  });

  const jimWalmsleyActivity = await prisma.activity.upsert({
    where: { id: jimWalmsleyActivityId },
    update: {},
    create: {
      userId: jimWalmsley.id,
      ...WALMSLEY_ACTIVITY,
    },
  });

  const stepanKiselevActivity = await prisma.activity.upsert({
    where: { id: stepanKiselevActivityId },
    update: {},
    create: {
      userId: stepanKiselev.id,
      ...KISELEV_ACTIVITY,
    },
  });

  const dmitryMityaevActivity = await prisma.activity.upsert({
    where: { id: dmitryMityaevActivityId },
    update: {},
    create: {
      userId: dmitryMityaev.id,
      ...MITYAEV_ACTIVITY,
    },
  });

  const jornetActivity = await prisma.activity.upsert({
    where: { id: jornetActivityId },
    update: {},
    create: {
      userId: kilianJornet.id,
      ...JORNET_ACTIVITY,
    },
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

  //Likes to activities
  const likesKiselevActivity = await prisma.like.createMany({
    data: [
      { activityId: stepanKiselevActivity.id, authorId: eliudKipchoge.id },
      { activityId: stepanKiselevActivity.id, authorId: kilianJornet.id },
      { activityId: stepanKiselevActivity.id, authorId: kenenisaBekele.id },
      { activityId: stepanKiselevActivity.id, authorId: courtneyDauwalter.id },
      { activityId: stepanKiselevActivity.id, authorId: moFarah.id },
      { activityId: stepanKiselevActivity.id, authorId: haileGebrselassie.id },
      { activityId: stepanKiselevActivity.id, authorId: jimWalmsley.id },
      { activityId: stepanKiselevActivity.id, authorId: stepanKiselev.id },
    ],
  });

  const likesMityaevActivity = await prisma.like.createMany({
    data: [
      { activityId: dmitryMityaevActivity.id, authorId: eliudKipchoge.id },
      { activityId: dmitryMityaevActivity.id, authorId: kilianJornet.id },
      { activityId: dmitryMityaevActivity.id, authorId: kenenisaBekele.id },
      { activityId: dmitryMityaevActivity.id, authorId: courtneyDauwalter.id },
      { activityId: dmitryMityaevActivity.id, authorId: moFarah.id },
      { activityId: dmitryMityaevActivity.id, authorId: haileGebrselassie.id },
      { activityId: dmitryMityaevActivity.id, authorId: jimWalmsley.id },
      { activityId: dmitryMityaevActivity.id, authorId: stepanKiselev.id },
      { activityId: dmitryMityaevActivity.id, authorId: dmitryMityaev.id },
    ],
  });

  const likesWalmsleyActivity = await prisma.like.createMany({
    data: [
      { activityId: jimWalmsleyActivity.id, authorId: eliudKipchoge.id },
      { activityId: jimWalmsleyActivity.id, authorId: kilianJornet.id },
      { activityId: jimWalmsleyActivity.id, authorId: kenenisaBekele.id },
      { activityId: jimWalmsleyActivity.id, authorId: courtneyDauwalter.id },
      { activityId: jimWalmsleyActivity.id, authorId: moFarah.id },
      { activityId: jimWalmsleyActivity.id, authorId: haileGebrselassie.id },
      { activityId: jimWalmsleyActivity.id, authorId: jimWalmsley.id },
    ],
  });

  const likesDauwalterActivity = await prisma.like.createMany({
    data: [
      { activityId: dauwalterActivity.id, authorId: eliudKipchoge.id },
      { activityId: dauwalterActivity.id, authorId: kilianJornet.id },
      { activityId: dauwalterActivity.id, authorId: kenenisaBekele.id },
      { activityId: dauwalterActivity.id, authorId: jimWalmsley.id },
    ],
  });

  const likesKipchogeActivity = await prisma.like.createMany({
    data: [
      { activityId: kipchogeActivity.id, authorId: courtneyDauwalter.id },
      { activityId: kipchogeActivity.id, authorId: haileGebrselassie.id },
      { activityId: kipchogeActivity.id, authorId: moFarah.id },
    ],
  });

  const likesJornetActivity = await prisma.like.createMany({
    data: [
      { activityId: jornetActivity.id, authorId: kenenisaBekele.id },
      { activityId: jornetActivity.id, authorId: courtneyDauwalter.id },
      { activityId: jornetActivity.id, authorId: moFarah.id },
    ],
  });

  //Comments to activities
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

  const commentsMityaevActivity = await prisma.comment.createMany({
    data: [
      {
        activityId: dmitryMityaevActivity.id,
        authorId: stepanKiselev.id,
        comment: 'Здарова, Диман',
      },
      {
        activityId: dmitryMityaevActivity.id,
        authorId: dmitryMityaev.id,
        comment: 'Че надо-то?',
      },
      {
        activityId: dmitryMityaevActivity.id,
        authorId: stepanKiselev.id,
        comment: 'Го побегать',
      },
      {
        activityId: dmitryMityaevActivity.id,
        authorId: dmitryMityaev.id,
        comment: 'Не, чет лень, чувак',
      },
    ],
  });

  const commentsWalmsleyActivity = await prisma.comment.createMany({
    data: [
      {
        activityId: jimWalmsleyActivity.id,
        authorId: kilianJornet.id,
        comment: 'Hi, Jim! Congrats to your UTMB competition. It was great!',
      },
      {
        activityId: jimWalmsleyActivity.id,
        authorId: jimWalmsley.id,
        comment: 'Thnx, Kilian',
      },
      {
        activityId: jimWalmsleyActivity.id,
        authorId: kilianJornet.id,
        comment: 'Go running next sunday',
      },
      {
        activityId: jimWalmsleyActivity.id,
        authorId: jimWalmsley.id,
        comment: 'Ok, bro',
      },
    ],
  });

  //Friends
  const friendsOfKipchoge = await prisma.friend.createMany({
    data: [
      { userId: eliudKipchoge.id, friendId: courtneyDauwalter.id },
      { userId: eliudKipchoge.id, friendId: kilianJornet.id },
      { userId: eliudKipchoge.id, friendId: moFarah.id },
      { userId: eliudKipchoge.id, friendId: jimWalmsley.id },
      { userId: eliudKipchoge.id, friendId: kenenisaBekele.id },
      { userId: eliudKipchoge.id, friendId: stepanKiselev.id },
    ],
  });

  const friendsOfDauwalter = await prisma.friend.createMany({
    data: [
      { userId: courtneyDauwalter.id, friendId: eliudKipchoge.id },
      { userId: courtneyDauwalter.id, friendId: kilianJornet.id },
      { userId: courtneyDauwalter.id, friendId: moFarah.id },
      { userId: courtneyDauwalter.id, friendId: dmitryMityaev.id },
      { userId: courtneyDauwalter.id, friendId: stepanKiselev.id },
      { userId: courtneyDauwalter.id, friendId: kenenisaBekele.id },
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
      { userId: kenenisaBekele.id, friendId: jimWalmsley.id },
    ],
  });

  const friendsOfWalmsley = await prisma.friend.createMany({
    data: [
      { userId: jimWalmsley.id, friendId: courtneyDauwalter.id },
      { userId: jimWalmsley.id, friendId: moFarah.id },
      { userId: jimWalmsley.id, friendId: kilianJornet.id },
      { userId: jimWalmsley.id, friendId: haileGebrselassie.id },
      { userId: jimWalmsley.id, friendId: dmitryMityaev.id },
      { userId: jimWalmsley.id, friendId: stepanKiselev.id },
      { userId: jimWalmsley.id, friendId: kenenisaBekele.id },
    ],
  });

  const friendsOfKiselev = await prisma.friend.createMany({
    data: [
      { userId: stepanKiselev.id, friendId: courtneyDauwalter.id },
      { userId: stepanKiselev.id, friendId: moFarah.id },
      { userId: stepanKiselev.id, friendId: kilianJornet.id },
      { userId: stepanKiselev.id, friendId: haileGebrselassie.id },
      { userId: stepanKiselev.id, friendId: dmitryMityaev.id },
      { userId: stepanKiselev.id, friendId: kenenisaBekele.id },
    ],
  });

  const friendsOfMityaev = await prisma.friend.createMany({
    data: [
      { userId: dmitryMityaev.id, friendId: courtneyDauwalter.id },
      { userId: dmitryMityaev.id, friendId: moFarah.id },
      { userId: dmitryMityaev.id, friendId: kilianJornet.id },
      { userId: dmitryMityaev.id, friendId: haileGebrselassie.id },
      { userId: dmitryMityaev.id, friendId: kenenisaBekele.id },
    ],
  });

  const friendsOfGebrselassie = await prisma.friend.createMany({
    data: [
      { userId: haileGebrselassie.id, friendId: courtneyDauwalter.id },
      { userId: haileGebrselassie.id, friendId: moFarah.id },
      { userId: haileGebrselassie.id, friendId: kilianJornet.id },
      { userId: haileGebrselassie.id, friendId: jimWalmsley.id },
      { userId: haileGebrselassie.id, friendId: dmitryMityaev.id },
      { userId: haileGebrselassie.id, friendId: kenenisaBekele.id },
    ],
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
    commentsMityaevActivity,
    commentsWalmsleyActivity,
    friendsOfDauwalter,
    friendsOfKipchoge,
    friendsOfJornet,
    friendsOfFarah,
    friendsOfHaile,
    friendsOfBekele,
    friendsOfKiselev,
    friendsOfMityaev,
    friendsOfWalmsley,
    friendsOfGebrselassie,
    likesKipchogeActivity,
    commentsKipchogeActivity,
    likesJornetActivity,
    commentsJornetActivity,
    likesKiselevActivity,
    likesWalmsleyActivity,
    likesMityaevActivity,
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
