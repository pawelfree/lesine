---
type: spec
date: 2026-10-14
status: implemented
slug: ci-pipeline-and-test-coverage
---

# CI pipeline, test frameworks, and baseline coverage

## Objective

Stand up GitHub Actions CI for every pull request with four required checks (build, lint,
unit tests, integration tests), introduce the unit- and integration-test frameworks, codify
a 100%-unit-test-coverage rule for new features in `AGENTS.md`, and bring the current
codebase (a near-empty NestJS skeleton) up to that bar — plus minimal home page and admin
panel features so the requested "basics" integration tests have something real to exercise.

## Decisions

- **Unit tests**: Jest + ts-jest (already a NestJS convention; `@nestjs/testing` is already a
  dependency). Coverage thresholds set to 100% for statements/branches/functions/lines in
  `package.json` jest config, scoped to `src/**/*.ts` excluding `src/main.ts` (pure
  framework bootstrap with no branching logic — the standard Nest exclusion).
- **Lint**: ESLint 10 flat config (`eslint.config.mjs`) with `typescript-eslint` recommended
  + `eslint-config-prettier`/`eslint-plugin-prettier`. CI runs a non-mutating
  `lint:check` script (`--max-warnings=0`), distinct from the local `lint` script which
  still auto-fixes.
- **Integration tests**: Jest-orchestrated, using `testcontainers`
  (`@testcontainers/postgresql`) to launch an ephemeral Postgres container, booting the
  Nest app in-process against it on a random port, then driving assertions against it with
  the `agent-browser` CLI (per explicit user instruction). `agent-browser` is a brand-new
  (published within the last day) Vercel CLI built for an AI agent to interactively drive a
  browser for exploratory QA — it has no native test-runner/assertion integration. We wrap
  it with `child_process` calls from inside Jest tests and assert on its CLI output
  (`get text`, `read`, exit codes) so Jest still provides the pass/fail signal and reporting
  CI needs. See `.ai/lessons/2026-10-14-agent-browser-cli-for-ci.md`.
- **Scaffolded features** (per user decision, since neither existed): a minimal
  server-rendered home page at `GET /`, a Postgres-backed `DatabaseService` used by a
  `GET /health/db` liveness check, and a Basic-Auth-gated `GET /admin` placeholder admin
  panel. These exist to give the integration-test suite a real "home page" and "admin
  panel" to cover, not as a feature spec in their own right.
- **AGENTS.md update**: add an explicit "every new feature must ship with unit tests
  achieving 100% coverage" rule, plus a note on the `main.ts` exclusion and the
  integration-test expectations, so future AI-assisted work doesn't need to rediscover this
  policy from the jest config.

## Out of scope

- Real admin-panel functionality (CRUD, auth beyond a single shared Basic Auth credential),
  ORM adoption, and any production data model — these are placeholders sized only to be
  testable, not a product spec.
- Running the integration suite inside this sandbox: Docker is unavailable here, so
  testcontainers/agent-browser-based tests are verified structurally and will run for real
  on GitHub Actions' `ubuntu-latest` runners (Docker preinstalled).

## Verification

See `.ai/runs/2026-10-14-ci-pipeline-and-test-coverage.md`.
