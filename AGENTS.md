# Project instructions

## Package registry access

- When an install, upgrade, or lockfile refresh needs npm registry access, run the package-manager command with `sandbox_permissions: "require_escalated"` on the first attempt and explain that registry access is needed. Do not make a restricted-network attempt first and retry only after it fails.
- Keep the escalated command scoped to the package-manager operation; do not combine it with unrelated shell changes.

## Repository layout

- All project Git roots are inside the project/ directory; run Git commands from that directory.

## Prisma schema and migration graph

- For every change under `prisma/**/*.prisma`, regenerate the contract with `yarn db:generate` before `yarn tsc --noEmit`. Review the generated `prisma/contract.json` and `prisma/contract.d.ts`; never edit generated contract files by hand.
- Plan a checked-in migration from the last known/applied contract to the regenerated contract. Use `yarn prisma migration plan --from <current-contract-hash> --name <slug>` and review the generated migration operations, especially defaults, data changes, and destructive DDL.
- Keep the schema change, generated contract, migration package, and target snapshot together. Run `yarn prisma migration check` after contract generation and before committing; resolve missing or unreachable migration edges before proceeding.
- `migration check` validates the local graph but does not apply a migration or prove remote database compatibility. Apply only reviewed, checked-in migrations through the deployment workflow; do not repair Stage/Production drift with `db:sync`, `db update`, or by moving database refs.

## Verification before completion

- For every task that changes application code, run the full project checks from this directory before reporting completion:
  - `yarn db:generate`
  - `yarn tsc --noEmit`
  - `yarn eslint src`
  - `node --max-old-space-size=6144 --experimental-vm-modules node_modules/jest/bin/jest.js --coverage --maxWorkers=50% --no-watchman`
- Generate the Prisma contract once before TypeScript and Jest. Inspect generated-file changes and preserve unrelated work.
- The full Jest coverage check enforces the configured global thresholds of at least 85% for branches, functions, lines, and statements.
- Standalone `yarn test:cov` generates the Prisma contract first; in a combined check, generate once and invoke Jest directly to reuse it.
- If coverage is below 85%, add meaningful behavior tests for uncovered code until the full test run passes. Do not lower thresholds or exclude code just to make coverage pass.
- Fix failures and rerun the affected checks after the final code changes. If a check cannot run or remains failing, report the exact command and reason; do not describe verification as passing.

## One-off deployment scenarios

- Remove temporary migration, bootstrap, and cutover scripts, workflow branches, and documentation once their one-time need has been verified as complete. Keep recovery procedures only when they remain an explicitly supported operational path.
## NestJS best practices reference

Use [docs/NESTJS_BEST_PRACTICES.md](docs/NESTJS_BEST_PRACTICES.md) when a task needs the full general NestJS guidance. Keep this file focused on repository-specific rules and verification gates.


## Service file structure

NestJS service files must contain imports and the decorated service class only. Do not define top-level helper functions, constants, variables, types, interfaces, or enums in a `*.service.ts` file, before or after the class. Place them in sibling `*.utils.ts`, `*.constants.ts`, or `*.types.ts` modules and import them into the service.

## Type assertions

- Prefer inferred types or explicit variable and return annotations over `as` assertions. An assertion only changes what TypeScript believes; it does not validate a runtime value.
- Keep untyped or external values as `unknown` and narrow them with runtime checks or a schema. Do not assert database query results or internal values to silence weak repository typings; annotate the receiving variable or improve the repository API.
- Use a narrow `as` assertion only at a documented boundary where no typed alternative is available, and add a short adjacent comment explaining the reason. `as const` is allowed when preserving literal tuple types. Test-only assertions may be used narrowly for invalid runtime inputs or incomplete mocks when a typed fixture is impractical.

## Runich release versioning

- Keep the Swagger `DocumentBuilder.setVersion()` value equal to the Runich Backend `package.json` version.
- Raising the minimum client version returned by backend `GET /auth/config` redirects older app versions to the update screen when they load the home page; account for that when planning a release.
- These Runich client/backend instructions are project-specific. Do not copy them into Clean Car.
