import 'dotenv/config';
import { spawn } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to synchronize the database');
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

prisma.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
