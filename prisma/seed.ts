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
      login: 'courtney123',
      password: '7FWD&rlm',
      email: 'dauwalter@gmail.com',
      profile: {
        create: {
          gender: 'female',
          sport: 'run',
          name: 'Courtney',
          surname: 'Dauwalter',
          weight: '60',
          bio: 'I worked as a middle and high-school teacher in the Denver area, before becoming a full-time professional runner in 2017',
          birthday: new Date(1985, 1, 13),
          profilePhoto:
            'https://runningmagazine.ca/wp-content/uploads/2017/10/22489723_1678610998837520_7136398489355883559_n.jpg',
        },
      },
      activity: {
        create: {
          description: 'Побегала чутка',
          distance: 190,
          duration: 65,
          emotion: 'fucking hard',
          isSwitchOn: false,
          photoUrl: 'https://article-imgs.scribdassets.com/4ny39m86bk9n1oy0/images/fileJZ891HXD.jpg',
          speed: 5,
          sport: 'run',
          title: 'It was awesome',
          comments: {
            create: {
              comment: 'Ha-ha! I run faster than you, Courtney!',
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
      login: 'eliud123',
      password: '7FWD&rlm',
      email: 'kipchoge@yandex.ru',
      profile: {
        create: {
          gender: 'male',
          sport: 'run',
          name: 'Eliud',
          surname: 'Kipchoge',
          weight: '66',
          bio: 'I am the best maraphoner in the histroy',
          birthday: new Date(1984, 10, 5),
          profilePhoto:
            'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Eliud_Kipchoge_in_Berlin_%28cropped%29.jpg/274px-Eliud_Kipchoge_in_Berlin_%28cropped%29.jpg',
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
            'https://img.olympicchannel.com/images/image/private/t_s_w1340/t_s_16_9_g_auto/f_auto/primary/cyr5teqkxh1yl63byx5c',
          speed: 2,
          sport: 'run',
          title: 'It was terrible',
          comments: {
            create: {
              comment: "Why don't you comment my post so disgusting, Eliud? It's not good for you",
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
