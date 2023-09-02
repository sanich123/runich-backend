import { PrismaClient } from '@prisma/client';
import { v4 } from 'uuid';

const prisma = new PrismaClient();
async function main() {
  const id1 = v4();
  const id2 = v4();

  const user1 = await prisma.user.upsert({
    where: { id: id1 },
    update: {},
    create: {
      login: 'sanich123',
      password: '7FWD&rlm',
      email: 'sanich123voronin@gmail.com',
      profile: {
        create: {
          gender: 'male',
          sport: 'running',
          name: 'Alexander',
          surname: 'Voronin',
          weight: '84',
          bio: 'I am a pianist, but the last years I became a runner. Now I trying to be a fucking programmer',
          birthday: new Date(1987, 0, 17),
          profilePhoto:
            'https://firebasestorage.googleapis.com/v0/b/runich-6be07.appspot.com/o/images%2Fimg-1693635519423.sanich123.runningapp%2Fcache%2FImagePicker%2F0fcff42c-32d7-4a8b-b76f-99610fdeeb80.jpeg?alt=media&token=49e1484e-909b-44a9-aad3-f4af7b1eb003',
        },
      },
      activity: {
        create: {
          description: 'It was a summer day, and the birds sang in the trees',
          distance: 190,
          duration: 65,
          emotion: 'fucking hard',
          isSwitchOn: false,
          photoUrl:
            'https://firebasestorage.googleapis.com/v0/b/runich-6be07.appspot.com/o/images%2Fimg-1693635519423.sanich123.runningapp%2Fcache%2FImagePicker%2F0fcff42c-32d7-4a8b-b76f-99610fdeeb80.jpeg?alt=media&token=49e1484e-909b-44a9-aad3-f4af7b1eb003',
          speed: 5,
          sport: 'run',
          title: 'It was awesome',
          comments: {
            create: {
              comment: 'Ha-ha! I run faster than you, bastard!',
              authorId: id2,
            },
          },
          locations: [
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244111,
                longitude: 37.30492,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244113,
                longitude: 37.30494,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244114,
                longitude: 37.30495,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244115,
                longitude: 37.30496,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244114,
                longitude: 37.30494,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244113,
                longitude: 37.30494,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244117,
                longitude: 37.30495,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244113,
                longitude: 37.304956,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244115,
                longitude: 37.304953,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244116,
                longitude: 37.304952,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244113,
                longitude: 37.304951,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.62441134,
                longitude: 37.3049513,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.624411345,
                longitude: 37.30495133,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244113456,
                longitude: 37.304951332,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.62441,
                longitude: 37.304951,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
          ],
        },
      },
    },
  });

  const user2 = await prisma.user.upsert({
    where: { id: id2 },
    update: {},
    create: {
      login: 'sanich321',
      password: '7FWD&rlm',
      email: 'varon-in@yandex.ru',
      profile: {
        create: {
          gender: 'packman',
          sport: 'swim',
          name: 'Sanich',
          surname: 'Varonen',
          weight: '88',
          bio: 'I love running, and runs a lot of time ',
          birthday: new Date(1987, 0, 17),
          profilePhoto:
            'https://firebasestorage.googleapis.com/v0/b/runich-6be07.appspot.com/o/images%2Fimg-1693663275705.sanich123.runningapp%2Fcache%2FImagePicker%2F42fcd589-5a71-4277-8f38-c5c50d6014d2.jpeg?alt=media&token=cc904080-7f54-45f9-8662-f3e4514a5c82',
        },
      },
      activity: {
        create: {
          description: 'It was rainy and terrible!',
          distance: 260,
          duration: 165,
          emotion: 'awesome',
          isSwitchOn: true,
          photoUrl:
            'https://firebasestorage.googleapis.com/v0/b/runich-6be07.appspot.com/o/images%2Fimg-1693663275705.sanich123.runningapp%2Fcache%2FImagePicker%2F42fcd589-5a71-4277-8f38-c5c50d6014d2.jpeg?alt=media&token=cc904080-7f54-45f9-8662-f3e4514a5c82',
          speed: 2,
          sport: 'swim',
          title: 'It was terrible',
          comments: {
            create: {
              comment: 'Why are you laughing at me, bastard?',
              authorId: id1,
            },
          },
          locations: [
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244111,
                longitude: 37.30492,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244113,
                longitude: 37.30494,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244114,
                longitude: 37.30495,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244115,
                longitude: 37.30496,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244114,
                longitude: 37.30494,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244113,
                longitude: 37.30494,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244117,
                longitude: 37.30495,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244113,
                longitude: 37.304956,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244115,
                longitude: 37.304953,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244116,
                longitude: 37.304952,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244113,
                longitude: 37.304951,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.62441134,
                longitude: 37.3049513,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.624411345,
                longitude: 37.30495133,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.6244113456,
                longitude: 37.304951332,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
            {
              coords: {
                accuracy: 100,
                altitude: 204.79998779296875,
                altitudeAccuracy: 85.56611633300781,
                heading: 0,
                latitude: 55.62441,
                longitude: 37.304951,
                speed: 0,
              },
              mocked: false,
              timestamp: 1693661794508,
            },
          ],
        },
      },
    },
  });

  console.log(user1, user2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
