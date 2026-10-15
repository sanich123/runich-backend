# Project instructions

## Verification before completion

- For every task that changes application code, run the full project checks from this directory before reporting completion:
  - `yarn eslint src` (use this diagnostic command; `yarn lint` runs ESLint with `--fix`)
  - `yarn typecheck`
  - `yarn test:cov`
- `yarn typecheck` generates the Prisma contract before running TypeScript. Inspect generated-file changes and preserve unrelated work.
- `yarn test:cov` is the full Jest coverage check and enforces the configured global thresholds of at least 85% for branches, functions, lines, and statements.
- If coverage is below 85%, add meaningful behavior tests for uncovered code until the full test run passes. Do not lower thresholds or exclude code just to make coverage pass.
- Fix failures and rerun the affected checks after the final code changes. If a check cannot run or remains failing, report the exact command and reason; do not describe verification as passing.
