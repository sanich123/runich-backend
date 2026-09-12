# Runich Backend

Backend API for Runich, a social fitness application for activities, profiles, friends, comments, likes and statistics.

## Stack

- NestJS 12, TypeScript 6 and ESM
- Node.js >=26 <27
- Yarn 4.18.0
- PostgreSQL 18.6 and Prisma 8 (RC contract/runtime)
- JWT bearer authentication
- Swagger/OpenAPI at /api in local and stage; production access is disabled

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
    APP_ENV=local
    YANDEX_SMTP_USER=Runich.app@ya.ru
    YANDEX_SMTP_PASSWORD=your-yandex-mail-application-password
    RUNICH_PROCESS=api
    S3_ENDPOINT=https://s3.twcstorage.ru
    S3_REGION=ru-1
    S3_BUCKET=your-timeweb-bucket-name
    S3_ACCESS_KEY=your-timeweb-access-key
    S3_SECRET_ACCESS_KEY=your-timeweb-secret-key
    YANDEX_CLIENT_ID=your-yandex-client-id
    YANDEX_CLIENT_SECRET=your-yandex-client-secret
    YANDEX_REDIRECT_URI=http://localhost:3000/auth/yandex/callback
    AUTH_FRONTEND_REDIRECT_URI=http://localhost:5173/login-from-url
    VK_CLIENT_ID=your-vk-client-id
    VK_CLIENT_SECRET=your-vk-client-secret
    VK_REDIRECT_URI=http://localhost:3000/auth/vk/callback

Initialize the database and start development mode:

    yarn dev

Start the background worker in a second terminal:

    yarn worker:dev

`yarn dev` emits the Prisma 8 contract and synchronizes the database with the
current contract before starting the development server. To update only the
database, run `yarn db:sync`. Prisma 8 uses `prisma/contract.prisma` as the
source of truth; the generated `contract.json` and `contract.d.ts` are runtime
artifacts.

The API is available at http://localhost:3000; Swagger is at http://localhost:3000/api.
Liveness is available at `/health/live`, and Railway readiness checks should use
`/health/ready`.

Production SSH access, Docker Compose logs, health checks and background worker
diagnostics are documented in [OPERATIONS.md](OPERATIONS.md).

Known environment and integration limitations are tracked in
[doc/known-issues.md](doc/known-issues.md).

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

Swagger is enabled automatically in local and stage without a separate
variable or authentication. It is disabled automatically in production.

Tracked activities are reduced by the mobile client to at most 5,000 location
points before sending. The API accepts the same maximum and limits JSON request
bodies to 5 MiB. Larger routes should be sampled on the client or uploaded in
chunks instead of increasing the global body limit.

### Docker Compose

    docker compose up --build --remove-orphans

The local Compose database uses PostgreSQL 18.6. `POSTGRES_PASSWORD` and the
local `DATABASE_URL_DOCKER` are required in the ignored `.env` file. The database
port is bound only to `127.0.0.1` for local migrations; Railway uses private
service networking and does not use this Compose port mapping.

Production on Timeweb uses `docker-compose.timeweb.yml`. It does not start a
local PostgreSQL container: `DATABASE_URL_DOCKER` must contain the connection
string of the separate Timeweb PostgreSQL service over the private network.
The deployment workflow starts the API and worker with this file and keeps the
local `docker-compose.yml` workflow unchanged.

For Railway, add `DATABASE_URL` as a reference to the PostgreSQL service's
Railway variable, for example `${{Postgres.DATABASE_URL}}`. Do not copy the
local `.env` file or database password into the repository.

Use secret management and rotated credentials in production. Never commit .env, database credentials, JWT secrets, SMTP passwords or third-party API tokens.

## Configuration

| Variable                   | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| DATABASE_URL               | PostgreSQL connection string                                       |
| DATABASE_URL_DOCKER        | Connection string used inside Docker; local uses `db`, Timeweb uses the private DBaaS IP |
| POSTGRES_USER, POSTGRES_DB | Local Compose database user and database name                      |
| POSTGRES_PASSWORD          | Local Compose database password                                    |
| PORT                       | HTTP port, default 3000                                            |
| APP_ENV                    | Application environment: local, stage or production                |
| YANDEX_SMTP_USER           | Full Yandex mailbox address used as the sender                     |
| YANDEX_SMTP_PASSWORD       | Yandex application password for Mail                               |
| MAPBOX_ACCESS_TOKEN        | Mapbox Static Images API access token                              |
| S3_ENDPOINT                | S3-compatible endpoint, defaults to `https://s3.twcstorage.ru`      |
| S3_REGION                  | S3 region, defaults to `ru-1`                                      |
| S3_BUCKET                  | S3 bucket name                                                     |
| S3_ACCESS_KEY              | Server-side S3 access key                                          |
| S3_SECRET_ACCESS_KEY       | Server-side S3 secret key                                          |
| S3_PUBLIC_URL              | Optional public URL prefix; defaults to endpoint plus bucket       |
| JWT_SECRET                 | Secret used to sign and verify JWT tokens                          |
| YANDEX_CLIENT_ID           | Yandex ID application client ID                                    |
| YANDEX_CLIENT_SECRET       | Yandex ID application secret, server-side only                     |
| YANDEX_REDIRECT_URI        | Registered Yandex OAuth callback URL                               |
| AUTH_FRONTEND_REDIRECT_URI | Frontend URL for OAuth and email login credentials                 |
| VK_CLIENT_ID               | VK ID application client ID                                        |
| VK_CLIENT_SECRET           | VK ID application secret, server-side only                         |
| VK_REDIRECT_URI            | Registered VK OAuth callback URL                                   |
| VK_API_VERSION             | Optional VK API version, defaults to 5.199                         |
| RUNICH_PROCESS             | Process role: api or worker                                        |
| SEED_USER_EMAIL            | Optional email used by the database seed                           |

Email is sent through Yandex SMTP at `smtp.yandex.ru:465` with TLS. The
`YANDEX_SMTP_USER` value is the full mailbox address (`Runich.app@ya.ru` in
the current account), and `YANDEX_SMTP_PASSWORD` must be an application
password created for Mail. The regular Yandex account password and Yandex ID
OAuth credentials are not used for SMTP.

For the production OAuth configuration, register and use these exact callback
URLs in both provider dashboards:

    YANDEX_REDIRECT_URI=https://api.runich-app.ru/auth/yandex/callback
    VK_REDIRECT_URI=https://api.runich-app.ru/auth/vk/callback

`AUTH_FRONTEND_REDIRECT_URI` is the post-login redirect used by both OAuth and
email links. It must point to the frontend belonging to the current
environment, for example `https://runich.netlify.app/login-from-url` in
production or `https://stage--runich.netlify.app/login-from-url` in stage.

Stage uses its own S3 bucket (`runich-stage`) and production uses a separate
bucket. Photo writes are enabled in both environments. Mock data is created
automatically only in local and stage; production never runs the mock seed.
Set `RUNICH_PROCESS=worker` for the background worker so it does not run the
mock seed a second time.

### Railway stage

Railway stage uses a separate PostgreSQL service and the same application
contract as production. Set `DATABASE_URL` in the API and worker services to a
Railway reference such as `${{Postgres.DATABASE_URL}}`. Set the same S3
variables in both services, using the stage-only Timeweb bucket:

    APP_ENV=stage
    S3_ENDPOINT=https://s3.twcstorage.ru
    S3_REGION=ru-1
    S3_BUCKET=runich-stage
    S3_PUBLIC_URL=https://s3.twcstorage.ru/runich-stage

Keep the S3 access key and secret in Railway variables. They are not committed
to `.env.example` or copied from the local `.env` file.

## Commands

Scripts are grouped by responsibility: application lifecycle, `worker:*`,
`db:*`, `test:*`, and code-quality commands.

### Application and worker

| Command            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `yarn dev`         | Development API with watch mode                  |
| `yarn start`       | Development API without watch mode               |
| `yarn start:debug` | Development API with Node inspector              |
| `yarn build`       | Build the production bundles with tsup           |
| `yarn start:prod`  | Synchronize the current contract and run the compiled API |
| `yarn worker:dev`  | Development background worker                    |
| `yarn worker:prod` | Synchronize the current contract and run the built worker |

### Database

| Command               | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `yarn db:up`          | Start local PostgreSQL and reconcile its Prisma 8 marker |
| `yarn db:generate`    | Emit the Prisma 8 contract artifacts                     |
| `yarn db:sync`        | Synchronize the database with the current contract       |
| `yarn db:seed`        | Seed the configured database                             |

### Tests

| Command                 | Description                         |
| ----------------------- | ----------------------------------- |
| `yarn test`             | Default Jest run                    |
| `yarn test:watch`       | Jest watch mode                     |
| `yarn test:ci`          | Serial CI unit-test run             |
| `yarn test:cov`         | Unit tests with coverage thresholds |
| `yarn test:integration` | PostgreSQL integration/e2e tests    |
| `yarn test:all`         | Local database and all test groups  |

### Code quality

| Command          | Description                                       |
| ---------------- | ------------------------------------------------- |
| `yarn typecheck` | TypeScript check                                  |
| `yarn lint`      | ESLint with fixes for `src` and integration tests |
| `yarn format`    | Format TypeScript source and tests                |
| `yarn madge`     | Check circular dependencies                       |
| `yarn ts-prune`  | Find unused exports                               |
| `yarn depcheck`  | Inspect unused dependencies                       |

## Database and seed data

The Prisma 8 contract is in `prisma/contract.prisma`. A fresh database is
created directly from this contract with `yarn db:sync`. There is no schema
migration history in the repository; `contract.prisma` is the single source of
truth. The database column names remain stable through `@map(...)`; application
and API names use camelCase.

    yarn db:generate
    yarn db:sync
    yarn db:seed

In local and stage, the application creates 100 deterministic mock runners in
the background. Each user gets 0–40 activities, each activity gets 0–40
comments and likes, each comment gets 0–40 likes, and each user follows 0–40
other users. Comment, like and activity timestamps are varied. The mock seed
version is bumped when fixtures need recreation. Use stage only with its
intended test database because this fixture can create a large amount of data.

## Project structure

    prisma/
    └── seed.ts                   # Development database seed
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
    ├── infrastructure/database/ # Prisma 8 runtime and repositories
    ├── tests/
    │   ├── integration/         # PostgreSQL integration/e2e tests
    │   ├── functional/          # Cross-module behavior tests
    │   ├── validation/          # DTO and input validation tests
    │   ├── security/            # Ownership and authorization tests
    │   └── helpers.ts           # Shared test helpers
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

Photo and video uploads use `POST /photo` with a `file` multipart field. The
backend keeps S3 credentials private and returns a public object URL. `DELETE
/photo` accepts that URL and only allows objects under the authenticated user's
prefix. Account deletion creates a durable cleanup job; the existing background
worker removes every S3 object under that prefix after the database transaction.
The same worker calculates missing blurhash values for activity photos, videos
and map images after the activity has been saved.

## Quality gates

Before opening a pull request:

    yarn db:generate
    yarn typecheck
    yarn eslint src
    yarn build
    yarn test:ci
    yarn test:cov
    yarn test:integration
    yarn madge

Integration tests require a disposable PostgreSQL database configured through
`DATABASE_URL`. `yarn test:integration` synchronizes the current contract before
running the e2e suite. The CI workflow starts PostgreSQL, synchronizes the
contract, runs all quality gates and builds the Docker image.

See CONTRIBUTING.md for development and review rules. The package is private and marked UNLICENSED.
