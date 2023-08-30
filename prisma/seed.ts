import { PrismaClient } from '@prisma/client';
import { v4 } from 'uuid';

const prisma = new PrismaClient();
async function main() {
  const id1 = v4();
  const id2 = v4();

  const user1 = await prisma.user.upsert({
    where: {
      id: id1,
    },
    update: {},
    create: {
      id: v4(),
      login: 'sanich123',
      password: '7fwd7rlm',
      email: 'someEmail@gmail.com',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { id: id2 },
    update: {},
    create: {
      login: 'sanich143',
      password: '17011987',
      email: 'someEmail2@gmail.com',
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
