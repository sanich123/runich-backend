import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig } from '@prisma/orm-postgres/config';

// The contract is the Prisma 8 source of truth. The fallback keeps contract
// emission possible in image builds where Compose injects DATABASE_URL only at
// runtime; database commands still require the real connection string.
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default definePrismaConfig({
  orm: defineConfig({
    contract: 'prisma/contract.prisma',
    db: {
      connection: databaseUrl,
    },
    migrations: {
      dir: 'prisma/migrations',
    },
  }),
});
