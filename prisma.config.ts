import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` runs during the Docker image build, before Compose injects
// runtime environment variables. The fallback is only used for generation;
// migrate commands still require the real DATABASE_URL at runtime.
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
