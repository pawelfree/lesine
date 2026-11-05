# EODHD catalog refresh implementation

Goals: Implement issue #18 from the accepted spec; deliver a reviewed, ready PR with tested UI flow.
Specification: [2026-11-05-eodhd-catalog-ui-refresh.md](../specs/2026-11-05-eodhd-catalog-ui-refresh.md)
Status: in-progress

2026-11-05 — Start isolated implementation branch with a phase/step plan and draft PR for visibility.
Decision: reuse the catalog parser, budget ledger, local API security and current `/data` table.
Remaining: migration, worker, API, UI, tests, verification and review.

2026-11-05 — Add migration 005 for refresh jobs, published membership, current pointer and legacy EODHD backfill; extend migration tests.
Decision: preserve all pre-existing source identities and identify the prior visible list as legacy, without a false publication timestamp.
Verification: API TypeScript build passed; database integration will run in the isolated Compose environment. Remaining: worker, API, UI and runtime verification.

2026-11-05 — Mark schema step 1.1 complete in the execution plan after commit b7652f2.
Decision: retain database integration execution as a phase gate in isolated Compose.
Remaining: implement worker, API, UI and end-to-end checks.

2026-11-05 — Implement durable catalog-only worker jobs, two-list staging, budget/lease handling, atomic publication and guarded CLI probe.
Decision: require distinct active/delisted codes in one published pair; retain old identities and use current membership for depth samples.
Verification: isolated Docker worker integration suites passed (3 tests). Remaining: API, UI and full smoke/review.

2026-11-05 — Add catalog refresh API, versioned current-list reads and current-membership EOD import planning.
Decision: server-side confirmation and pointer publication share a transaction lock; stale list versions require a fresh decision.
Verification: isolated API database integration passed (3 tests) and TypeScript compiled. Remaining: UI, full smoke and review.

2026-11-05 — Mark worker step 1.2 and API step 1.3 complete in the execution plan.
Decision: phase 1 is ready for owner UI integration and full-stack verification.
Remaining: UI commit, Docker/browser smoke, review and PR readiness.

2026-11-05 — Add `/data` catalog action, confirmation, progress/retry and version-aware paging; update owner instructions.
Decision: empty catalog queues directly; a nonempty list requires an explicit dialog and a matching server-side catalog id.
Verification: Angular UI suite passed (6 tests). Remaining: full-stack smoke, review and PR readiness.
