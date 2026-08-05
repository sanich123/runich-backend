import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/infrastructure/database/generated/prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

async function main() {
  const password1 = await bcrypt.hash('7FWD&rlm', 10);
  const password2 = await bcrypt.hash('7FWD&rlm', 10);
  const seedUserEmail = process.env.SEED_USER_EMAIL ?? 'demo@runich.app';

  const user1 = await prisma.users.upsert({
    where: { email: seedUserEmail },
    update: { encrypted_password: password1 },
    create: {
      email: seedUserEmail,
      encrypted_password: password1,
    },
  });

  const user2 = await prisma.users.upsert({
    where: { email: 'varon-in@yandex.ru' },
    update: { encrypted_password: password2 },
    create: {
      email: 'varon-in@yandex.ru',
      encrypted_password: password2,
    },
  });
  console.log({ user1, user2 });
}

main()
  .then(async () => await prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
