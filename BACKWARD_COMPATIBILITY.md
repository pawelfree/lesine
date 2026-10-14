# Backward compatibility contract

This file inventories this project's protected contract surfaces and how changes to them must be handled. Review skills (`om-code-review`, `om-auto-review-pr`) check changes against this file and flag violations; implementation skills warn before shipping a change that breaks one of these surfaces without the required migration path.

## HTTP routes and response shapes

The application exposes these routes (all under `src/*/\*.controller.ts`). Each is a protected contract surface: its path, method, status codes, and response body shape must not change without a documented migration.

| Route | Method | Handler | Response | Notes |
|---|---|---|---|---|
| `/status` | GET | `AppController.getStatus` (`src/app.controller.ts`) | `200 { message: string, status: 'ok' }` | Plain JSON status probe. |
| `/health` | GET | `HealthController.getLiveness` (`src/health/health.controller.ts`) | `200 { status: 'ok' }` | Liveness probe; likely polled by external uptime/orchestration tooling. |
| `/health/db` | GET | `HealthController.getDatabaseHealth` | `200 { status: 'ok' }` or `503 { status: 'error' }` | Status code itself is part of the contract (used for readiness checks), not just the body. |
| `/` | GET | `HomeController.getHomePage` (`src/home/home.controller.ts`) | `200`, `Content-Type: text/html` | Server-rendered HTML via `home.view.ts`; unauthenticated. |
| `/admin` | GET | `AdminController.getAdminPage` (`src/admin/admin.controller.ts`) | `200`, `Content-Type: text/html`; `401` with `WWW-Authenticate: Basic realm="admin"` when unauthenticated | Protected by `BasicAuthGuard`. |
| `/admin/advisor-reports/extract` | POST | `AdvisorReportsController.extract` (`src/advisor-reports/advisor-reports.controller.ts`) | `200 { report: ParsedAdvisorReport, warnings: string[] }`; `400` (Nest's standard `{ statusCode, message, error }` shape) for a missing/unparsable upload; `401` when unauthenticated | Protected by `BasicAuthGuard`. Manual-verification tool for issue #2 (E01-S01); persists nothing. |

**Breaking changes** to any route above: removing a route, changing its path, changing a success/error status code, or changing the JSON key names/types in its response. **Required path**: add a new route/version alongside the old one, keep the old one responding unchanged for at least one release, and note the deprecation in the PR body and `CHANGELOG.md`. A purely additive change (a new optional field in a JSON response, a new route) is not breaking.

## Authentication

- `/admin` requires HTTP Basic Auth, validated by `BasicAuthGuard` (`src/common/basic-auth.guard.ts`) against `ADMIN_USERNAME` / `ADMIN_PASSWORD` environment variables (defaulting to `admin`/`admin` when unset — a deployment contract, not just a code default).
- **Breaking changes**: switching the auth scheme (e.g. to a token/session model), renaming the expected env vars, or changing the default credentials behavior. **Required path**: any such change needs a migration note for operators (how to set the new credentials) and a second reviewer per `SDLC.md`'s `risk-high` auth gate.

## Environment variables / configuration surface

| Variable | Consumer | Breaking change |
|---|---|---|
| `DATABASE_URL` | `DatabaseService` (`src/database/database.service.ts`), passed straight to `pg.Pool` | Renaming it or changing its expected format (e.g. requiring discrete host/port/user vars instead) without a fallback. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | `BasicAuthGuard` | Renaming them or removing the default fallback without an operator-facing migration note. |

**Required path** for any env var rename or removal: support both names for one release (read the new one, fall back to the old with a deprecation note), document the change in the PR body and `CHANGELOG.md`.

## Database

- There is currently no migrations directory or schema file in this repository — `DatabaseService` only runs a `SELECT 1` liveness probe, it does not own any table schema. When a schema is introduced, this section must be updated to list the migration tool, the required up/down test, and the rollback plan referenced by `SDLC.md`'s `risk-high` schema-migration gate.

## Package/module exports

- This is a standalone NestJS application (`"private": true` in `package.json`), not a published package — there is no external consumer of a module/package export surface today. If any part of `src/` is ever extracted into a published package, this file must be updated to inventory its public exports before that happens.

## CLI commands

- No CLI surface is exposed by this project today (`npm` scripts in `package.json` are developer-facing only, not a distributed CLI). Add a section here if one is introduced.

## Published events / webhooks

- None exist in this codebase today. Add a section here before shipping the first one, naming the event/webhook payload shape as a protected surface alongside the HTTP routes above.
