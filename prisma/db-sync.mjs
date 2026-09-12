import 'dotenv/config';
import { spawn } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to synchronize the database');
}

const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+/, ''));
if (!databaseName) {
  throw new Error('DATABASE_URL must include a database name');
}

const client = new Client({ connectionString: databaseUrl });
try {
  await client.connect();
  await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`pg_trgm extension is required before database synchronization: ${message}`);
} finally {
  await client.end().catch(() => undefined);
}

const prisma = spawn(
  'yarn',
  [
    'prisma',
    'db',
    'update',
    '--no-interactive',
    '--confirm',
    databaseName,
    '--db',
    databaseUrl,
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);

prisma.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

prisma.on('exit', async (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;

  if (code !== 0 || signal) {
    return;
  }

  const indexes = new Client({ connectionString: databaseUrl });
  try {
    await indexes.connect();
    await indexes.query(`
      CREATE INDEX IF NOT EXISTS "Users_email_trgm_idx"
        ON "Users" USING GIN ("email" gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS "Profile_name_trgm_idx"
        ON "Profile" USING GIN ("name" gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS "Profile_surname_trgm_idx"
        ON "Profile" USING GIN ("surname" gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS "Profile_email_trgm_idx"
        ON "Profile" USING GIN ("email" gin_trgm_ops);
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to create trigram indexes: ${message}`);
    process.exitCode = 1;
  } finally {
    await indexes.end().catch(() => undefined);
  }
});
