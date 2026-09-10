# Contributing to Runich Backend

Thank you for contributing. This document describes the local workflow, code organization and checks expected before review.

## Before you start

1. Read README.md and identify the affected feature module.
2. Never commit .env, credentials, JWT secrets, SMTP passwords, database URLs or API tokens.
3. For security-sensitive changes, describe the threat model and affected endpoints in the pull request.

## Local setup

    corepack enable
    yarn install
    yarn db:generate
    yarn db:sync
    yarn dev

Mock data is enabled automatically for local and stage. Use it only with a
disposable development or stage database.

## Branches and commits

Create a topic branch from stage:

    git switch stage
    git pull --ff-only
    git switch -c feature/short-description

Use focused Conventional Commit-style prefixes:

- feat: new behavior
- fix: bug fix
- refactor: behavior-preserving code change
- test: tests only
- docs: documentation
- chore: tooling, dependencies or maintenance

Keep commits small enough to review. Explain breaking changes in the commit body and pull request description.

## Code organization

- Put domain code in its feature directory: auth, activity, comment, friend, like, account, user, statistic or email.
- Keep shared DTOs, decorators, filters, parsers, logging and utilities in src/common.
- Keep Prisma integration in src/infrastructure/database/prisma.
- Use DTOs with class-validator for request input.
- Do not access Prisma directly from controllers.
- Do not log secrets, passwords, bearer tokens or full request bodies.
- Prefer Nest Logger over console.log in application code.
- Return safe client-facing errors and retain details only in server logs.
- Commit `prisma/contract.prisma` and generated contract artifacts together with
  schema changes. This project intentionally starts each database from the
  current contract instead of maintaining schema migration packages.

## Adding an endpoint

1. Add or update the feature DTO with explicit validation decorators.
2. Implement business logic in the feature service.
3. Add the controller route and authentication/authorization requirements.
4. Add Swagger metadata when the endpoint is public API.
5. Add success, validation and failure tests.
6. Update doc/api.yaml when the contract changes.
7. Verify resource ownership using the authenticated user.

## Database changes

    yarn db:generate
    yarn prisma db update --dry-run
    yarn db:sync

Edit `prisma/contract.prisma`, emit the contract and review the dry-run plan
before applying it. Do not edit `contract.json` or `contract.d.ts` manually.
Because a schema reset is part of the deployment model, destructive changes
must be applied only to the explicitly selected disposable or reset database.

## Testing and checks

Run the full quality gate before pushing:

    yarn typecheck
    yarn eslint src
    yarn build
    yarn test:ci
    yarn test:cov
    yarn test:integration
    yarn madge

Tests should be deterministic and isolated from production services.
The integration suite uses PostgreSQL and must run only against a disposable
database. It covers HTTP access control, private activities and database-backed
session behavior.

Activity requests are bounded at 5,000 location points and 5 MiB of JSON body
data. Keep the client-side reduction in place; do not bypass these limits by
raising the global parser limit for a single large route.

The test, coverage and typecheck scripts run `yarn db:generate` before
executing, so generated Prisma 8 contract artifacts cannot become stale in CI.

## Pull requests

PRs should target master unless agreed otherwise and explain:

- what changed and why;
- migrations, API contract changes and operational impact;
- test commands and results;
- known limitations and follow-up work.

Keep the PR focused. Avoid mixing unrelated formatting, dependency upgrades or generated-file changes into a feature change.

## Review checklist

- [ ] No secrets or local files are committed.
- [ ] Input validation is present.
- [ ] Authentication and resource ownership are enforced.
- [ ] Errors map to safe HTTP responses.
- [ ] Logs contain context without sensitive data.
- [ ] Tests cover changed behavior and failure paths.
- [ ] Coverage thresholds pass (`yarn test:cov`).
- [ ] PostgreSQL integration/e2e tests pass (`yarn test:integration`).
- [ ] Docker image builds successfully.
- [ ] Database migrations are included when needed.
- [ ] Typecheck, ESLint, build, tests and Madge pass.
