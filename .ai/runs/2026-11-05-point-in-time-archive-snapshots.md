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

2026-11-05 — Commit records implementation steps 1.1–3.1 after a470a4d.
Verification: full build and isolated Compose smoke passed; both migration orders preserve action generation.
Remaining: final technical review and PR completion.

2026-11-05 — Commit pins completed import manifests, including empty responses, and detects unimported ranges.
Decision: archive generation advances for manifest-only imports as well as EOD and action revisions.
Pitfall: test fixtures needed the chunk-to-manifest pointer used by real imports; concurrent PG queries were serialized.
Remaining: re-review current code and publish PR evidence.

2026-11-05 — Commit adds action and identity foreign keys when those tables preceded migration 010.
Decision: migrations 008 and 009 add the same constraints when they follow 010.
Verification: all three migrations, triggers and keys pass in both orders; snapshot and import regressions pass.
Remaining: final review, PR metadata and handoff.

2026-11-05 — Commit prevents future identity-map evidence from entering strict historical aggregation.
Decision: strict snapshots select the latest batch imported by cutoff and reject same-day date-only identity proof.
Verification: PostgreSQL tests cover later batch correction and same-day evidence; the assumed policy remains labeled.
Remaining: final code review and PR publication.
