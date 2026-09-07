# Runich Backend

Backend API for Runich, a social fitness application for activities, profiles, friends, comments, likes and statistics.

## Stack

- NestJS 11, TypeScript 6 and ESM
- Node.js >=26 <27
- Yarn 4.18.0
- PostgreSQL 18.6 and Prisma 7
- JWT bearer authentication
- Swagger/OpenAPI at /api in development; production access is disabled by default

## Quick start

Install Node.js 26 and Corepack:

    corepack enable
    yarn install

Create a local, ignored .env file:

    DATABASE_URL=postgresql://user:password@localhost:5432/runich_db?schema=public
    DATABASE_URL_DOCKER=postgresql://user:password@db:5432/runich_db?schema=public
    POSTGRES_USER=runich
    POSTGRES_PASSWORD=local-password
    POSTGRES_DB=runich_db
    PORT=3000
    NODE_ENV=development
    SWAGGER_ENABLED=true
    GOOGLE_CLIENT_ID=your-google-oauth-client-id
    GOOGLE_SECRET=your-google-oauth-client-secret
    GOOGLE_REFRESH_TOKEN=your-google-oauth-refresh-token
    USER_EMAIL=your-gmail-address
    EMAIL_API_TIMEOUT=15000
    IS_DEV=true
    SEED_MOCK_DATA=false
    VK_CLIENT_ID=your-vk-client-id
    VK_CLIENT_SECRET=your-vk-client-secret
    VK_REDIRECT_URI=http://localhost:3000/auth/vk/callback
    VK_FRONTEND_REDIRECT_URI=http://localhost:5173/login-from-url

Initialize the database and start development mode:

    yarn start:dev

Start the migration worker in a second terminal:

    yarn start:migration-worker

`yarn start:dev` generates the Prisma Client and applies all committed database
migrations before starting the development server. To update only the database,
run `yarn migrate`.

The API is available at http://localhost:3000; Swagger is at http://localhost:3000/api.
Liveness is available at `/health/live`, and Railway readiness checks should use
`/health/ready`.

Sensitive endpoints have route-specific rate limits. Login and registration
allow 5 requests per minute. Email-code and password-change endpoints allow
5 requests per 10 minutes. Strava archive imports allow 2 requests per
10 minutes, and feedback photo uploads allow 5 requests per 10 minutes.
Exceeding a limit returns HTTP 429 with a `Retry-After` response header.
Following a user and liking an activity or comment are idempotent: repeating
the same request returns the existing relation with HTTP 200.

JWT access tokens expire after 1 day. Refresh tokens expire after 30 days,
are stored as hashes for persistent sessions, and are rotated on every
successful refresh.

Swagger is disabled by default in every environment and is enabled only when
`SWAGGER_ENABLED=true` is set. If enabled in production, both
`SWAGGER_USER` and `SWAGGER_PASSWORD` are required and protect `/api` and
`/api-json` with Basic Auth. Store these values only in Railway variables or a
local ignored `.env` file.

Tracked activities are reduced by the mobile client to at most 5,000 location
points before sending. The API accepts the same maximum and limits JSON request
bodies to 5 MiB. Larger routes should be sampled on the client or uploaded in
chunks instead of increasing the global body limit.

### Docker Compose

    docker compose up --build

The local Compose database uses PostgreSQL 18.6. `POSTGRES_PASSWORD` and
`DATABASE_URL_DOCKER` are required in the ignored `.env` file. The database
port is bound only to `127.0.0.1` for local migrations; Railway uses private
service networking and does not use this Compose port mapping.

For Railway, add `DATABASE_URL` as a reference to the PostgreSQL service's
Railway variable, for example `${{Postgres.DATABASE_URL}}`. Do not copy the
local `.env` file or database password into the repository.

Use secret management and rotated credentials in production. Never commit .env, database credentials, JWT secrets, SMTP passwords or third-party API tokens.

## Configuration

| Variable                          | Purpose                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| DATABASE_URL                      | PostgreSQL connection string                                      |
| DATABASE_URL_DOCKER               | Local Compose connection string using the `db` hostname           |
| POSTGRES_USER, POSTGRES_DB        | Local Compose database user and database name                     |
| POSTGRES_PASSWORD                 | Local Compose database password                                   |
| PORT                              | HTTP port, default 3000                                           |
| NODE_ENV                          | Runtime environment                                               |
| SWAGGER_ENABLED                   | Enable Swagger; production default is disabled                    |
| SWAGGER_USER, SWAGGER_PASSWORD    | Basic Auth credentials when Swagger is enabled in production      |
| GOOGLE_CLIENT_ID, GOOGLE_SECRET   | Google OAuth client credentials                                   |
| GOOGLE_REFRESH_TOKEN              | Offline OAuth token with Gmail Send permission                    |
| USER_EMAIL                        | Gmail sender address                                              |
| EMAIL_API_TIMEOUT                 | Google OAuth and Gmail API timeout in milliseconds, default 15000 |
| MAPBOX_ACCESS_TOKEN               | Mapbox Static Images API access token                             |
| MIGRATION_ARCHIVE_DIRECTORY       | Durable directory shared by the API and migration worker          |
| MIGRATION_ACTIVITY_BATCH_SIZE     | Activities processed and committed per worker batch, default 8    |
| MIGRATION_BATCH_PAUSE_MS          | Pause between migration batches in milliseconds, default 25       |
| MIGRATION_WORKER_POLL_INTERVAL_MS | Queue polling interval in milliseconds, default 10000             |
| MIGRATION_WORKER_CPUS             | Docker CPU limit for the migration worker, default 0.50           |
| JWT_SECRET                        | Secret used to sign and verify JWT tokens                         |
| VK_CLIENT_ID                      | VK ID application client ID                                       |
| VK_CLIENT_SECRET                  | VK ID application secret, server-side only                        |
| VK_REDIRECT_URI                   | Registered VK OAuth callback URL                                  |
| VK_FRONTEND_REDIRECT_URI          | Frontend URL receiving the application JWT                        |
| VK_API_VERSION                    | Optional VK API version, defaults to 5.199                        |
| IS_DEV                            | Development URL selection in email templates                      |
| SEED_MOCK_DATA                    | Create mock users and activities at startup                       |
| SEED_USER_EMAIL                   | Optional email used by Prisma seed                                |

## Commands

| Command                          | Description                             |
| -------------------------------- | --------------------------------------- |
| yarn migrate                     | Apply committed migrations              |
| yarn start:dev                   | Development server with watch mode      |
| yarn start:debug                 | Development server with Node inspector  |
| yarn build                       | Build with tsup                         |
| yarn start:prod                  | Run compiled application                |
| yarn start:migrate:prod          | Apply migrations and start compiled app |
| yarn start:migration-worker      | Run the Strava migration worker         |
| yarn start:migration-worker:prod | Run the compiled migration worker       |
| yarn typecheck                   | TypeScript check                        |
| yarn eslint src                  | ESLint check without auto-fix           |
| yarn test:ci                     | Serial CI test run                      |
| yarn test:cov                    | Jest coverage run                       |
| yarn test:integration            | PostgreSQL integration/e2e tests        |
| yarn format                      | Format TypeScript files                 |
| yarn prisma generate             | Generate Prisma Client                  |
| yarn prisma migrate dev          | Create a development migration          |
| yarn prisma migrate deploy       | Apply committed migrations              |
| yarn madge                       | Check circular dependencies             |
| yarn ts-prune                    | Find unused exports                     |
| yarn depcheck                    | Inspect dependencies                    |

## Database and seed data

The schema is in prisma/schema.prisma, and committed migrations are in prisma/migrations.

    yarn prisma generate
    yarn prisma migrate deploy
    yarn prisma db seed

Setting SEED_MOCK_DATA=true creates 100 deterministic mock runners. Each user gets 0–40 activities, each activity gets 0–40 comments and likes, each comment gets 0–40 likes, and each user follows 0–40 other users. Comment, like and activity timestamps are varied. The mock seed version is bumped when fixtures need recreation. Use only with a disposable development database because this fixture can create a large amount of data.

## Project structure

    src/
    ├── account/                  # Profiles, filtering and updates
    ├── activity/                # Activities and Strava archive migration
    ├── auth/                    # Registration, login and JWT
    ├── comment/                 # Comments and comment likes
    ├── email/                   # Email endpoints and templates
    ├── friend/                  # Following and followers
    ├── like/                    # Activity likes
    ├── statistic/               # Activity statistics
    ├── user/                    # User profile CRUD
    ├── common/                  # Shared DTOs, filters, parsers and utilities
    ├── infrastructure/database/ # Prisma integration and generated client
    └── main.ts                  # Application bootstrap

## API

The API currently exposes 48 operations in the `/auth`, `/user`, `/profile`, `/activity`, `/comment`, `/friend`, `/like`, `/statistics` and `/email` groups. Most routes require `Authorization: Bearer <token>`.

The endpoint inventory is in `doc/api.yaml`; Swagger at `/api` is the authoritative source for request and response schemas.

Strava archive migration is asynchronous. `POST /activity/migration-strava/:id`
returns HTTP 202 with a `jobId`; poll
`GET /activity/migration-strava/jobs/:jobId` for status and progress. The API
only stores the upload and queues the job. A separate worker extracts the
archive and commits each activity batch together with its progress, so a worker
restart resumes from the last committed batch. Docker Compose stores queued
archives in a shared named volume and limits the worker to half a CPU by
default.

## Quality gates

Before opening a pull request:

    yarn prisma generate
    yarn typecheck
    yarn eslint src
    yarn build
    yarn test:ci
    yarn test:cov
    yarn test:integration
    yarn madge

Integration tests require a disposable PostgreSQL database configured through
`DATABASE_URL`. `yarn test:integration` applies committed migrations before
running the e2e suite. The CI workflow starts PostgreSQL, applies migrations,
runs all quality gates and builds the Docker image.

See CONTRIBUTING.md for development and review rules. The package is private and marked UNLICENSED.
