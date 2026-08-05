# Runich Backend

Backend API for Runich, a social fitness application for activities, profiles, friends, comments, likes and statistics.

## Stack

- NestJS 11, TypeScript 6 and ESM
- Node.js >=26 <27
- Yarn 4.18.0
- PostgreSQL 17 and Prisma 7
- JWT bearer authentication
- Swagger/OpenAPI at /api

## Quick start

Install Node.js 26 and Corepack:

    corepack enable
    yarn install

Create a local, ignored .env file:

    DATABASE_URL=postgresql://user:password@localhost:5432/runich_db?schema=public
    PORT=3000
    NODE_ENV=development
    SMTP_HOST=smtp.example.com
    SMTP_PORT=465
    SMTP_SECURE=true
    SMTP_USER=your-user
    SMTP_PASSWORD=your-password
    SMTP_FROM=Runich <your-user>
    IS_DEV=true
    SEED_MOCK_DATA=false

Initialize the database and start development mode:

    yarn prisma generate
    yarn prisma migrate deploy
    yarn start:dev

The API is available at http://localhost:3000; Swagger is at http://localhost:3000/api.

### Docker Compose

    docker compose up --build

Use secret management and rotated credentials in production. Never commit .env, database credentials, JWT secrets, SMTP passwords or third-party API tokens.

## Configuration

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | PostgreSQL connection string |
| PORT | HTTP port, default 3000 |
| NODE_ENV | Runtime environment |
| SMTP_HOST, SMTP_PORT, SMTP_SECURE | SMTP connection |
| SMTP_USER, SMTP_PASSWORD, SMTP_FROM | Email credentials and sender |
| IS_DEV | Development URL selection in email templates |
| SEED_MOCK_DATA | Create mock users and activities at startup |
| SEED_USER_EMAIL | Optional email used by Prisma seed |

## Commands

| Command | Description |
| --- | --- |
| yarn start:dev | Development server with watch mode |
| yarn start:debug | Development server with Node inspector |
| yarn build | Build with tsup |
| yarn start:prod | Run compiled application |
| yarn start:migrate:prod | Apply migrations and start compiled app |
| yarn typecheck | TypeScript check |
| yarn eslint src | ESLint check without auto-fix |
| yarn test:ci | Serial CI test run |
| yarn test:cov | Jest coverage run |
| yarn format | Format TypeScript files |
| yarn prisma generate | Generate Prisma Client |
| yarn prisma migrate dev | Create a development migration |
| yarn prisma migrate deploy | Apply committed migrations |
| yarn madge | Check circular dependencies |
| yarn ts-prune | Find unused exports |
| yarn depcheck | Inspect dependencies |

## Database and seed data

The schema is in prisma/schema.prisma, and committed migrations are in prisma/migrations.

    yarn prisma generate
    yarn prisma migrate deploy
    yarn prisma db seed

Setting SEED_MOCK_DATA=true creates deterministic mock runners, 20 activities per mock user, comments, comment likes, friends and 0–20 distinct likes per activity. The mock seed version is bumped when fixtures need recreation. Use only with a disposable development database.

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

Route groups are /auth, /user, /profile, /activity, /comment, /friend, /like, /statistics and /email. Most routes require Authorization: Bearer <token>.

The complete contract is in doc/api.yaml; Swagger is available at /api.

## Quality gates

Before opening a pull request:

    yarn typecheck
    yarn eslint src
    yarn build
    yarn test:ci
    yarn madge

See CONTRIBUTING.md for development and review rules. The package is private and marked UNLICENSED.
