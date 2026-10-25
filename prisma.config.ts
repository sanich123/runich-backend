import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig } from '@prisma/orm-postgres/config';

const databaseUrl = process.env.DATABASE_URL?.trim();

export default definePrismaConfig({
  orm: defineConfig({
    contract: './prisma/**/*.prisma',
    ...(databaseUrl ? { db: { connection: databaseUrl } } : {}),
  }),
});
