import 'dotenv/config';
import { spawn } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to apply production migrations');
}

const client = new Client({ connectionString: databaseUrl });
try {
  await client.connect();
  await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
} finally {
  await client.end().catch(() => undefined);
}

function runPrisma(args) {
  return new Promise((resolve, reject) => {
    const prisma = spawn('yarn', ['prisma', ...args], { stdio: 'inherit' });

    prisma.once('error', reject);
    prisma.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Prisma ${args.join(' ')} stopped by ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`Prisma ${args.join(' ')} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

await runPrisma(['db', 'migrate', '--advance-ref', 'db']);
await runPrisma(['migration', 'status']);
await runPrisma(['db', 'verify']);
