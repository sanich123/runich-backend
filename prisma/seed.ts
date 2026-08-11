import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/infrastructure/database/generated/prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

const PHOTOS_PER_USER = 100;
const DAY_IN_MS = 86_400_000;

function seedPhotoUrl(userId: string, photoIndex: number) {
  return `https://picsum.photos/seed/runich-${userId}-${photoIndex + 1}/1200/800`;
}

async function seedPhotosForUser(user: { id: string; email: string }) {
  const profile = await prisma.profile.upsert({
    where: { user_id: user.id },
    update: {},
    create: {
      user_id: user.id,
      email: user.email,
    },
  });

  await prisma.activity.createMany({
    data: Array.from({ length: PHOTOS_PER_USER }, (_, photoIndex) => {
      const photo = seedPhotoUrl(user.id, photoIndex);

      return {
        user_id: user.id,
        profileId: profile.id,
        title: `Seed photo #${photoIndex + 1}`,
        sport: 'RUNNING',
        distance: 5000,
        duration: 1800,
        speed: 10,
        date: new Date(Date.now() - photoIndex * DAY_IN_MS),
        isPublic: true,
        source: 'seed',
        sourceActivityId: `photo-${photoIndex + 1}`,
        photoVideoUrls: [{ url: photo, thumbnail: photo }],
      };
    }),
    skipDuplicates: true,
  });
}

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
  await Promise.all([seedPhotosForUser(user1), seedPhotosForUser(user2)]);

  console.log({
    users: [user1.email, user2.email],
    photosPerUser: PHOTOS_PER_USER,
  });
}

main()
  .then(async () => await prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
