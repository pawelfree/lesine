# Point-in-time archive snapshots

Goals: Implement immutable point-in-time archive snapshots and open a reviewed implementation PR.
Specification: [2026-11-05-point-in-time-archive-snapshots.md](../specs/2026-11-05-point-in-time-archive-snapshots.md)
Status: in-progress

2026-11-05 — Commit creates the execution plan before snapshot code.
Decision: migration 010 will be independent of action migration 008 and identity migration 009.
Remaining: creator, reader, optional adapters, tests and review.

2026-11-05 — Commit adds immutable snapshot storage, generation tracking, creator, reader and optional action/identity adapters.
Decision: strict evidence verifies local first import; research assumptions stay explicitly marked and cannot backdate corrections.
Verification: PostgreSQL integration test covers corrections, concurrent import, incomplete scope, backup/restore and adapters.
Remaining: final build, review and PR handoff.
