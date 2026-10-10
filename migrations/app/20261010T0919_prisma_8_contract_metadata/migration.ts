#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3efb48b9264a2456ae47ae133573e8f8f132c2e9ec9de007412bf5cef2990a1c/contract';
import endContract from '../../snapshots/3efb48b9264a2456ae47ae133573e8f8f132c2e9ec9de007412bf5cef2990a1c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/efdab076dc839ea4bc9e5fef52b67e2efbb219fac552ea9f7a4a41dc6329457a/contract';
import startContract from '../../snapshots/efdab076dc839ea4bc9e5fef52b67e2efbb219fac552ea9f7a4a41dc6329457a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [];
  }
}

MigrationCLI.run(import.meta.url, M);
