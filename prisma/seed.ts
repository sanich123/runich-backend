import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { createDatabaseRepositories } from '../src/infrastructure/database/prisma/database-repository';
import { databaseClient } from '../src/infrastructure/database/prisma/client';

const prisma = createDatabaseRepositories(databaseClient);

const PHOTOS_PER_USER = 100;
const DAY_IN_MS = 86_400_000;

function seedPhotoUrl(userId: string, photoIndex: number) {
  return `https://picsum.photos/seed/runich-${userId}-${photoIndex + 1}/1200/800`;
}

async function seedPhotosForUser(user: { id: string; email: string }) {
  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      email: user.email,
    },
  });

  await prisma.activity.createMany({
    data: Array.from({ length: PHOTOS_PER_USER }, (_, photoIndex) => {
      const photo = seedPhotoUrl(user.id, photoIndex);

      return {
        userId: user.id,
        profileId: profile.id,
        title: `Seed photo #${photoIndex + 1}`,
        sport: 'RUNNING',
        distance: 5000,
        duration: 1800,
        speed: 10,
        date: new Date(Date.now() - photoIndex * DAY_IN_MS),
        visibility: 'public',
        source: 'seed',
        sourceActivityId: `photo-${photoIndex + 1}`,
        photoVideoUrls: [{ url: photo, thumbnail: photo }],
      };
    }),
    skipDuplicates: true,
  });
}

async function main() {
  await databaseClient.connect();
  const password1 = await bcrypt.hash('7FWD&rlm', 10);
  const password2 = await bcrypt.hash('7FWD&rlm', 10);
  const seedUserEmail = process.env.SEED_USER_EMAIL ?? 'demo@runich.app';

  const user1 = await prisma.user.upsert({
    where: { email: seedUserEmail },
    update: { encryptedPassword: password1 },
    create: {
      email: seedUserEmail,
      encryptedPassword: password1,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'varon-in@yandex.ru' },
    update: { encryptedPassword: password2 },
    create: {
      email: 'varon-in@yandex.ru',
      encryptedPassword: password2,
    },
  });
  await Promise.all([seedPhotosForUser(user1), seedPhotosForUser(user2)]);

  console.log({
    users: [user1.email, user2.email],
    photosPerUser: PHOTOS_PER_USER,
  });
}

main()
  .then(async () => await databaseClient.close())
  .catch(async (e) => {
    console.error(e);
    await databaseClient.close();
    process.exit(1);
  });
