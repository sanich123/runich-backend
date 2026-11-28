---
name: runich-prisma
description: Use for Prisma 8 contract, migration, database sync, and CLI work in the Runich backend.
---

# Runich Prisma

This repository uses Prisma 8 with `@prisma/orm-postgres`; check the installed
versions in `package.json` before relying on version-specific guidance. Do not
apply Prisma 7 conventions to this project.

- Follow the Prisma contract and migration workflow in the repository's
  `AGENTS.md`; do not duplicate or bypass it.
- `yarn prisma:sync` wraps `prisma db update --no-interactive`. It is for local
  bootstrap only and can alter or drop database objects absent from the
  contract. Stage and Production use checked-in migrations through deployment.
- Never pass `--delete <schema.table>` without the user's explicit approval to
  discard that table's data. A CLI error or a checked-in migration alone is
  not approval to run a destructive command against the current database.
- For Prisma 8 behavior that is not covered by `AGENTS.md`, use the installed
  Prisma package's guidance or documentation matching the installed version;
  Prisma 8 release candidates can differ from older Prisma documentation.
