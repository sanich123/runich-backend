import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../../../../prisma/contract';
import contractJson from '../../../../prisma/contract.json' with { type: 'json' };

// Prisma ORM RC.10 emits nullable to-one relation metadata in contract.json but
// omits it from the generated contract.d.ts, so the generated type fails the
// runtime client's constraint until the upstream emitter is fixed.
// @ts-expect-error Prisma RC.10 generated contract relation type mismatch.
export const databaseClient = postgres<Contract>({
  contractJson,
  url: process.env.DATABASE_URL,
});
