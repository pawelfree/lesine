---
type: run
date: 2026-10-14
status: completed
slug: ci-pipeline-and-test-coverage
---

# CI pipeline, test frameworks, and baseline coverage

## Objective

Stand up required GitHub Actions checks (build, lint, unit tests, integration tests) for
every pull request, introduce the unit/integration test frameworks, codify a 100%-unit-test
rule in `AGENTS.md`, and bring the (previously nearly empty) codebase to that bar, including
minimal home page and admin panel features so the integration suite has something real to
cover.

## Decisions

- Asked the user to resolve two ambiguities before implementing (see spec
  `.ai/specs/implemented/2026-10-14-ci-pipeline-and-test-coverage.md` for full rationale):
  1. `agent-browser` turned out to be Vercel's brand-new (published ~1 day prior) AI-agent
     browser-automation CLI, not a CI test framework — no assertion library, no test-runner
     integration. User chose to use it anyway (literal instruction), via CLI calls wrapped
     in Jest.
  2. Neither a "home page" nor an "admin panel" existed in the codebase. User chose to
     scaffold minimal versions first, then test those.
- Jest + ts-jest for unit tests (package.json `jest` config), 100% coverage threshold,
  `src/main.ts` excluded (framework bootstrap, no logic).
- ESLint 10 flat config + typescript-eslint + eslint-config-prettier/eslint-plugin-prettier.
  Added `lint:check` (CI, `--max-warnings=0`, no autofix) alongside the existing `lint`
  (local, autofix).
- Integration tests: `testcontainers`/`@testcontainers/postgresql` to start Postgres, boot
  the real `AppModule` in-process on a random port, drive assertions with the `agent-browser`
  CLI via `child_process`. Negative Basic-Auth check uses plain `fetch` instead of the
  browser, to avoid a native OS credentials dialog hanging headless automation — recorded in
  `.ai/lessons/2026-10-14-agent-browser-cli-for-ci.md`.
- Scaffolded: `DatabaseService`/`DatabaseModule` (`pg` Pool, `ping()`), `GET /health` and
  `GET /health/db`, `GET /` home page (HTML, shows DB status), `GET /admin` (HTML, behind a
  hand-rolled `BasicAuthGuard` reading `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars, default
  `admin`/`admin`). Existing root JSON status endpoint moved to `GET /status` to free up `/`
  for the home page.

## Files changed

- App code: `src/database/*`, `src/health/*`, `src/home/*`, `src/admin/*`,
  `src/common/basic-auth.guard.ts`, updated `src/app.controller.ts`, `src/app.module.ts`,
  `src/main.ts` (floating-promise lint fix).
- Unit tests: one `*.spec.ts` per new/changed file, plus `src/app.module.spec.ts` for DI
  wiring — 100% statement/branch/function/line coverage confirmed locally.
- Integration tests: `test/integration/agent-browser.ts`, `test/integration/test-app.ts`,
  `test/integration/app.integration-spec.ts`, `test/jest-integration.json`.
- Tooling/config: `package.json` (deps, scripts, jest config), `eslint.config.mjs`,
  `.prettierrc.json`, `.gitignore`.
- CI: `.github/workflows/ci.yml` (`build`, `lint`, `unit-tests`, `integration-tests` jobs).
- Docs: `AGENTS.md` (new "Continuous integration & test coverage" section).
- `.ai`: this run log, `.ai/lessons/2026-10-14-agent-browser-cli-for-ci.md` +
  `.ai/lessons.md` index entry, spec moved to `.ai/specs/implemented/`.

## Verification

- `npm run build` — passes.
- `npm run lint:check` — passes, zero warnings.
- `npx tsc --noEmit` — no type errors (covers `src/` and `test/`).
- `npm run test:cov` — 24 tests pass, **100% coverage** on statements/branches/functions/
  lines across every file in `src/` (main.ts excluded by design).
- `npm run test:integration` — confirmed it compiles and executes correctly up through
  `PostgreSqlContainer.start()`, which fails in this sandbox only because Docker is not
  available here (`Could not find a working container runtime strategy`). Could not be run
  end-to-end in this environment; will run for real on GitHub Actions' `ubuntu-latest`
  runners, which ship Docker preinstalled. The `agent-browser get text <selector>` CSS-selector
  assumption (used for the `data-testid` checks) is based on the CLI's documented "raw CSS
  selector" fallback but has not been exercised against a live Chrome session — worth
  confirming on the first real CI run.

## Blockers / remaining risks

- Cannot execute the integration suite end-to-end in this sandbox (no Docker). First real
  signal will come from the CI run on GitHub.
- No git remote is configured for this repository, so branch-protection "required status
  checks" for the four new jobs must be configured manually on GitHub by the user — the
  workflow file alone doesn't make checks blocking.
- `agent-browser` is ~1 day old at the time of writing (`0.39.1`); its CLI surface may change
  quickly across versions. Pinned via `^0.39.1` in `package.json`; a breaking release could
  require updating `test/integration/agent-browser.ts`.
- Default admin credentials (`admin`/`admin`) are a placeholder; real deployments must set
  `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars — not enforced at runtime (no production secrets
  concept in this skeleton yet).
