# Code review guide

This file documents this repository's code-review rules as a standalone, human-editable reference. `om-code-review` (and therefore `om-auto-review-pr`) applies it automatically on every review, in addition to its built-in checklist and any path set in `.ai/agentic.config.json`'s `reviewChecklist`.

## Stack

- **Runtime**: Node.js >= 24, TypeScript, NestJS 11 (Express platform).
- **Data**: PostgreSQL via `pg`, accessed through the single `DatabaseService` (`src/database/database.service.ts`), registered as a `@Global()` module so every feature module injects it rather than opening its own pool.
- **Views**: server-rendered HTML returned as strings from `*.view.ts` functions (e.g. `src/home/home.view.ts`, `src/admin/admin.view.ts`), served with `@Header('Content-Type', 'text/html')`.
- **Auth**: a single custom `BasicAuthGuard` (`src/common/basic-auth.guard.ts`) protects the `/admin` route via HTTP Basic Auth, credentials from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars, constant-time compared.
- **Tests**: Jest + `ts-jest` for unit tests (`*.spec.ts` colocated with source), `testcontainers`/`@testcontainers/postgresql` + `agent-browser` (driven via `child_process`, see `.ai/lessons/2026-10-14-agent-browser-cli-for-ci.md`) for integration tests under `test/integration/`.
- **Lint/format**: ESLint flat config (`eslint.config.mjs`) with `typescript-eslint` recommended-type-checked rules plus Prettier integration; `lint:check` runs with `--max-warnings=0`.

## Review priorities

1. **Correctness** — does the change do what the PR claims, including edge cases (empty/missing env vars, DB unreachable, malformed `Authorization` header)?
2. **Security** — no new unauthenticated access to `/admin`; no credential or secret leaked in logs, error messages, or HTML output; any new comparison of secrets uses a constant-time function like the existing `safeEqual` in `basic-auth.guard.ts`, never `===`.
3. **Contracts** — HTTP route paths, status codes, and JSON response shapes are protected surfaces; see `BACKWARD_COMPATIBILITY.md` before changing any of `/status`, `/health`, `/health/db`, `/`, or `/admin`.

## Repo-specific checks

- **New routes/controllers** follow the existing pattern: one `@Controller()` class per feature directory under `src/<feature>/`, a matching `<feature>.module.ts`, and a `*.spec.ts` alongside the implementation — never bypass Nest's DI by instantiating services directly.
- **Database access** goes through `DatabaseService` (or a new service that follows its `OnModuleDestroy` pool-cleanup pattern) — no ad hoc `new Pool()` in controllers or other services.
- **Guards** protecting new routes should be `@Injectable()` Nest `CanActivate` guards registered with `@UseGuards(...)`, matching `BasicAuthGuard`'s shape, not inline middleware.
- **HTML views** stay as pure functions in `*.view.ts` returning strings; no templating engine or unescaped user input interpolated into HTML (XSS).
- **Every new route, branch, and service method ships with a unit test** — the Jest coverage threshold in `package.json` is 100% (statements/branches/functions/lines) across `src/**/*.ts`, excluding only `src/main.ts`. A PR that adds code without covering every branch is incomplete.
- **New user-facing routes/flows** (real HTTP/browser behavior: rendering, auth, DB-backed state) get an integration test under `test/integration/` alongside unit tests, per `AGENTS.md`'s CI section — except flows that would trigger a native browser credentials prompt (e.g. unauthenticated Basic Auth checks), which use a plain HTTP request instead; see `.ai/lessons/2026-10-14-agent-browser-cli-for-ci.md`.
- **Lint must be warning-free** (`npm run lint:check`, `--max-warnings=0`) — do not suppress a rule with an inline disable comment without explaining why in the PR.
- **Environment variables** (`DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and any new ones) must have a safe fallback or an explicit startup failure — never a silent `undefined` reaching a query or comparison.

## Severity guidance

- **Blocker** — breaks an existing route's path/status/response shape without a documented migration (see `BACKWARD_COMPATIBILITY.md`); introduces an authentication bypass on `/admin`; drops unit-test coverage below 100%; fails the validation gate (`npm run build`, `npm run lint:check`, `npm run test:cov`, `npm run test:integration`).
- **Major** — new DB access that bypasses `DatabaseService`; a new user-facing route with no integration test; unescaped output in an HTML view.
- **Minor** — style/formatting inconsistent with the existing controller/module/view pattern; missing or unclear naming; a comment that restates the code.

Label and claim discipline (how findings map to PR labels, the QA gate, and the claim protocol) is documented in `SDLC.md`, not here.
