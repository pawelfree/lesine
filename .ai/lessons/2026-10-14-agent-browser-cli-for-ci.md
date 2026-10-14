---
type: lesson
date: 2026-10-14
slug: agent-browser-cli-for-ci
---

# Using `agent-browser` as a CI testing tool

`agent-browser` (Vercel Labs, npm package `agent-browser`) is a Rust CLI for browser
automation **built for an AI coding agent to drive interactively** — exploratory QA,
dogfooding, scraping, form-filling — not a Jest/Playwright-style test framework. It ships no
assertion library and no native test-runner integration; it's a daemon-backed CLI that an
agent (or a script) issues commands to (`open`, `snapshot`, `get text`, `click`, ...) and
reads text/JSON output back from.

**Why this matters**: when a request says "test X with agent-browser," there is no
off-the-shelf `@agent-browser/jest` style adapter to reach for. The working pattern is to
wrap the CLI in a small `child_process.execFileSync` helper (see
`test/integration/agent-browser.ts`) and let Jest provide the actual pass/fail/reporting
layer by asserting on the CLI's stdout. This keeps `agent-browser` as the literal browser
driver while keeping the suite deterministic and CI-reportable.

**Pitfall discovered**: an HTTP 401 response with a `WWW-Authenticate: Basic` header makes a
real Chromium instance pop a **native OS credentials dialog**, not a rendered page. Driving
that through headless CDP automation risks hanging the command indefinitely (no DOM to
query, no page load event to wait on). For a negative "requires auth" check, use a plain
`fetch()` HTTP request instead of `agent-browser open`; reserve the browser driver for paths
that actually render a page (set credentials proactively with `agent-browser set
credentials <user> <pass>` *before* opening a Basic-Auth-protected URL).

**Also note**: `agent-browser` requires `agent-browser install --with-deps` (downloads
Chrome for Testing + Linux rendering libs) as a separate CI step before first use — this
can't run inside `npm ci` alone, see `.github/workflows/ci.yml`'s `integration-tests` job.

See [[ci-pipeline-and-test-coverage]] (`.ai/specs/implemented/2026-10-14-ci-pipeline-and-test-coverage.md`)
for the full CI design this came out of.
