# EOD coverage and gap view implementation

Goals: Implement issue #5 from the accepted EOD coverage specification in a separate PR; verify API and UI behavior without consuming provider quota.
Specification: [2026-11-05-eod-coverage-gaps.md](../specs/2026-11-05-eod-coverage-gaps.md)
Status: in-progress

2026-11-05 — Added the phased implementation plan for the EOD coverage API and `/data` view.
Decision: implement the EOD-only report first, then the UI; use local fixtures and an isolated environment to avoid EODHD calls and disturbing the owner's running stack.
Verification: plan checked against the accepted spec. Remaining: implementation, tests, review, UI evidence and ready PR.

2026-11-05 — Added migration 006, local report generation, filtered coverage API and database integration checks.
Decision: transactionally bump a report-input revision on catalog, identity and import changes; preserve old immutable reports and return null counts before any report exists.
Verification: Node 24 API build and isolated PostgreSQL coverage integration test passed. Remaining: `/data` UI, broader validation, review and UI evidence.
