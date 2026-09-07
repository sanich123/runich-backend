# Changelog

All notable project changes are documented here. The project does not currently use formal release tags, so entries are grouped by development milestones and commit history.

## Unreleased

### Documentation

- Added README.md with setup, configuration, architecture, seed and operational guidance.
- Added CONTRIBUTING.md with development, testing, migration and pull request rules.

## 2026-08-05 — Backend maintenance and structure

### Added

- Added unit tests for authentication, JWT strategy, users, profiles, activities, comments, friends, likes, statistics and utilities.
- Added mock activity likes with 0–20 distinct likers per activity.
- Added quality checks for TypeScript, ESLint, build, Jest and circular dependencies.

### Changed

- Reorganized shared code under src/common.
- Moved Prisma integration under src/infrastructure/database/prisma.
- Moved generated Prisma Client output under src/infrastructure/database/generated/prisma.
- Updated Prisma schema, seed imports and application imports.
- Updated Jest transform and coverage configuration for ESM.
- Removed the incompatible allowImportingTsExtensions TypeScript option.
- Bumped the mock seed version so fixtures are recreated with new like data.

### Removed

- Removed the deprecated Google login endpoint and related DTO/service implementation.

## 2026-08-03–2026-08-05 — Modern runtime and tooling

- Migrated the project to modern Yarn workflows and restored a committed yarn.lock.
- Migrated the codebase to ESM and updated Docker build/runtime configuration.
- Upgraded NestJS, TypeScript, ESLint, Prisma and PostgreSQL tooling.
- Added strict TypeScript configuration and modern lint/format tooling.
- Added Yandex SMTP support and React Email templates for confirmation, recovery, like and comment notifications.
- Added deterministic mock users and activity seed data.

## 2024–2025 — Platform features and integrations

- Added statistics by year, month, category, week and all-time totals.
- Added Strava archive import with GPX, TCX, FIT, CSV, gzip and ZIP processing.
- Added activity media/location endpoints, pagination and activity lookup by IDs.
- Added public/private activity support and cascade deletion behavior.
- Added email notifications for activity likes, comments and comment likes.
- Added blurhash-related activity/profile media fields.
- Updated the Prisma schema and dependencies for the managed PostgreSQL database model.
- Added Docker/Railway deployment workflows.

## 2023–2024 — Initial product functionality

- Started the Runich backend and introduced the initial NestJS API.
- Added registration, sign-in, JWT authentication and error handling.
- Added user profiles, profile search/filtering and pagination.
- Added activity creation, retrieval, update and deletion.
- Added friends, followers and follow relationships.
- Added comments, comment likes and activity likes.
- Added activity photos, locations, distance, duration and kilometer split data.
- Added initial database seeding and migration workflows.
- Added Swagger/OpenAPI documentation.

## Release policy

Until formal releases are introduced, changes are merged through pull requests into main and recorded under Unreleased. When a version is tagged, move completed entries into a dated version section and follow Keep a Changelog conventions.
