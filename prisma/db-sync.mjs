import 'dotenv/config';
import { spawn } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to synchronize the database');
}

const databaseName = process.env.POSTGRES_DB ?? 'runich_db';
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

prisma.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
