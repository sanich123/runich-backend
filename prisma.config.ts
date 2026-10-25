import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig } from '@prisma/orm-postgres/config';

// Контракт — единый источник истины для Prisma 8. Резервное значение позволяет
// сформировать контракт при сборке образа, когда Compose передает DATABASE_URL
// только во время запуска; для команд работы с базой нужна настоящая строка подключения.
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default definePrismaConfig({
  orm: defineConfig({
    contract: './prisma/**/*.prisma',
    db: {
      connection: databaseUrl,
    },
  }),
});
