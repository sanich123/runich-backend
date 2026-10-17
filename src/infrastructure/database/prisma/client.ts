import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../../../../prisma/contract';
import contractJson from '../../../../prisma/contract.json' with { type: 'json' };
import { getDatabaseUrl } from 'src/common/config/environment';

export const databaseClient = postgres<Contract>({
  contractJson,
  url: getDatabaseUrl(),
});
