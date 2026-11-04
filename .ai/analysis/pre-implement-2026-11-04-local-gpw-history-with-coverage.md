# 🔍 Pre-implementation analysis: Local GPW history with coverage

**Readiness: go** — the revised Angular/NestJS/PostgreSQL spec now defines worker claim/recovery, database/file backup and restore, and observable phase exits. Provider rights and live data coverage remain explicit acceptance gates before real backfill.

Spec: `.ai/specs/2026-11-04-local-gpw-history-with-coverage.md` · audited 2026-11-04 against `BACKWARD_COMPATIBILITY.md` and the built-in spec structure.

## 📋 Readiness gate

| # | Item | Result | Evidence |
|---|---|---|---|
| R1 | Declared ready status | ✅ | The spec declares `Status: Ready`; the accepted `/data` reference remains linked. |
| R2 | No blocking open questions | ✅ | No unanswered Open Questions or unconfirmed human-default markers. Provider access is an explicit acceptance gate. |
| R3 | Traceability | ✅ | The acceptance table maps US-1.1–1.3 to increments 1–2, steps 1–8 and independent fixture/observable checks. |
| R4 | API and UI contracts | ✅ | §API Contracts defines requests, responses, errors and access rules; §UI/UX defines the accepted reference and loading, empty, error, denied, quota and coverage states. Same-origin serving is explicit for Angular and `/api`. |
| R5 | Deliverable phases | ✅ | §Phasing gives dependencies and observable exits; each step has a verification target. Live source entitlement remains a gate before real-data acceptance. |
| R6 | Grounded codebase claims | ✅ | Repository search found no application source, schema, routes, manifests or tests; the spec marks these as new. The selected stack is recorded in the accepted technology decision. |

## 💥 Backward compatibility

No protected surface touched. `BACKWARD_COMPATIBILITY.md` lists no existing exported API, HTTP route, CLI, database schema, event or published configuration format. All eight implementation steps add greenfield surfaces. New contracts will need a migration policy once implemented.

## ⚠️ Risks

| Risk | Level | Impact | Mitigation |
|---|---|---|---|
| Provider rights, entitlement and historical scope | High | Real archive may remain blocked or incomplete | Steps 3 and 8 require an account-level sample and visible gap report before full backfill/acceptance. |
| Ticker identity and corrections | High | Incorrect joins contaminate scores and tests | Dated links, revision fingerprints, append-only rows and old/new snapshot fixture checks are specified. |
| PostgreSQL plus response-file consistency | Medium | A crash or restore may leave a manifest without its source file | §Data Model defines a stopped-writer backup bundle, restore hash verification and blocked coverage on missing files; steps 1/5 test it. |
| Separate API/worker recovery | Medium | A stopped worker may leave a job stuck in `running` | §Architecture and `ImportJob` define row-lock claim, expiring lease, token check and restart recovery; step 4 tests competing workers. |

## 📋 Implementation conditions

1. Configure real nonempty validation commands when the TypeScript monorepo is bootstrapped; the repository currently has none.
2. Obtain provider entitlement, source-depth and local-retention evidence before production backfill; fixture development may proceed without it, but neither archive increment may be declared delivered from fixtures alone.
3. Verify the new worker lease and backup/restore behavior against the exact competing-worker and missing-file oracles in the spec.

## 🧪 Audit limits

Read the current spec, accepted `/data` reference, App Spec, product-brief decisions, technology decision, `AGENTS.md`, `SDLC.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md`, `README.md` and `.ai/agentic.config.json`. Searched the repository for application source, routes, schema, manifests and tests; none were present. No provider account, live GPW sample, running UI or implementation tests were available.
