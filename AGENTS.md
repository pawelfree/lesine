# Project AI instructions

These instructions apply to all AI-assisted work in this project. Keep the project’s SDD artifacts and long-term AI memory in `.ai/`.

## Required `.ai` structure

```text
.ai/
├── specs/
│   ├── implemented/
│   └── archive/
├── runs/
├── lessons.md
└── lessons/
```

- `.ai/specs/` contains active SDD specifications.
- `.ai/specs/implemented/` contains specifications that have been fully implemented and verified.
- `.ai/specs/archive/` contains obsolete, rejected, or superseded specifications.
- `.ai/runs/` contains the durable log for each autonomous AI run.
- `.ai/lessons.md` is the concise index and long-term summary of lessons.
- `.ai/lessons/` contains detailed, topic-specific lesson records.

## Naming and metadata rules

Specifications and autonomous-run logs must use:

```text
YYYY-MM-DD-slug.md
```

Use the date the artifact was created, with a lowercase hyphen-separated slug. Do not overwrite an existing artifact; use a more specific slug when necessary.

Each specification must begin with this metadata block:

```yaml
---
type: spec
date: YYYY-MM-DD
status: proposed | in-progress | implemented | archived
slug: short-slug
---
```

Each autonomous-run log must begin with:

```yaml
---
type: run
date: YYYY-MM-DD
status: planned | in-progress | completed | blocked
slug: short-slug
---
```

Lesson records in `.ai/lessons/` should use the same `YYYY-MM-DD-slug.md` naming convention and begin with `type: lesson`, `date`, and `slug` metadata. Add a concise entry to `.ai/lessons.md` whenever a lesson is added or materially updated.

## Workflow requirements

1. Before implementing a non-trivial feature, check `.ai/specs/` for the applicable specification. Create one when the requested work needs an SDD artifact.
2. Keep specification status accurate. Move implemented specs to `.ai/specs/implemented/` and obsolete or superseded specs to `.ai/specs/archive/`; preserve their history.
3. For autonomous work, create or update exactly one dated log in `.ai/runs/`. Record the objective, relevant decisions, files changed, verification performed, and any remaining risks or blockers.
4. After fixing a bug, discovering a reusable pattern, or identifying an improvement, record the lesson in `.ai/lessons/` and update `.ai/lessons.md`.
5. Do not put secrets, credentials, tokens, or private user data in specs, run logs, or lessons.

## Continuous integration & test coverage

Every pull request runs four required GitHub Actions checks, defined in
`.github/workflows/ci.yml`: `build`, `lint`, `unit-tests`, `integration-tests`.

- **Build**: `npm run build` must succeed.
- **Lint**: `npm run lint:check` must pass with zero warnings (`--max-warnings=0`). Use
  `npm run lint` locally to auto-fix.
- **Unit tests**: Jest + `ts-jest`, run via `npm run test:cov`. The `package.json` jest
  config enforces a **100% coverage threshold** (statements/branches/functions/lines) over
  `src/**/*.ts`, excluding only `src/main.ts` (the bootstrap entrypoint, which is pure
  framework wiring with no branching logic). **Every new feature or code change must ship
  with unit tests that keep the suite at 100% coverage — a change without tests covering
  every statement and branch it adds is not complete and must not be merged.** When a
  branch is genuinely untestable framework plumbing (like `main.ts`), exclude it explicitly
  in the jest config and say so in the PR/run log rather than leaving coverage silently
  below 100%.
- **Integration tests**: Jest-orchestrated end-to-end tests under `test/integration/`, run
  via `npm run test:integration`. They use `testcontainers`
  (`@testcontainers/postgresql`) to start an ephemeral Postgres instance, boot the real
  Nest application in-process against it, and drive assertions against the running app with
  the `agent-browser` CLI (spawned via `child_process`, asserting on its text output).
  New user-facing routes or flows should get an integration test alongside their unit
  tests when they involve real HTTP/browser behavior (rendering, auth, DB-backed state) that
  unit tests with mocks can't exercise.

See `.ai/lessons/2026-10-14-agent-browser-cli-for-ci.md` for why `agent-browser` is driven
via raw CLI calls rather than a native test-runner integration, and when to fall back to a
plain HTTP request instead of a browser action (e.g. unauthenticated Basic Auth checks,
which would otherwise trigger a blocking native browser credentials prompt).

## Working principles

- **Plan before complex tasks.** For non-trivial work, invest in a plan up front (spec or plan mode) so implementation can happen in one pass. If an approach goes wrong mid-implementation, stop and return to planning rather than forcing a fix through.
- **Verify changes before declaring them done.** After implementing, check the result actually works (tests, a run, or a direct inspection) rather than assuming correctness, and reconsider the change for a cleaner approach if the first pass feels forced.
- **Record lessons after corrections.** When a human correction reveals a mistake or a better approach, capture the "why" as a lesson under the process in `.ai/lessons/` (see Workflow requirements above) so the same mistake isn't repeated.

When another instruction conflicts with this file, follow the higher-priority instruction and note the exception in the relevant run log.
