# GPW corporate actions import

Goals: Implement quota-aware EODHD dividend and split import with immutable source-backed revisions, retaining existing EOD behavior.
Specification: [2026-11-05-gpw-corporate-actions.md](../specs/2026-11-05-gpw-corporate-actions.md) (design PR #26)
Status: in-progress

2026-11-05 — Add the phased implementation plan and open an isolated implementation PR.
Decision: use the existing importer, local budget and raw-file manifest boundary; track action kind per chunk.
Verification: plan and journal staged diff checked before commit.
Remaining: schema, importer, correction handling and validation.

2026-11-05 — Add action-aware migration and API planning while preserving the EOD request contract.
Decision: completed action request windows, including empty responses, suppress incremental refetches.
Verification: API migration/planner integration tests pass in an isolated PostgreSQL container.
Remaining: worker normalization, correction handling, documentation and full validation.

2026-11-05 — Mark schema and action-window scheduling step 1.1 complete at 93522fc.
Decision: action jobs remain separate from EOD jobs so the existing Data-page status keeps its meaning.
Verification: PostgreSQL planner and migration tests passed before the implementation commit.
Remaining: worker normalization, correction handling, documentation and full validation.

2026-11-05 — Add dividend/split parsing and worker dispatch through the existing quota and manifest path.
Decision: retain adjusted and historical dividend values separately; same-day ambiguous events stay flagged.
Verification: worker unit and isolated PostgreSQL import integration tests pass.
Remaining: action reader, documentation, full gate and review.

2026-11-05 — Mark dividend/split worker step 1.2 complete at ac0a97d.
Decision: later corrections use new revisions; repeated unchanged responses link the existing revision.
Verification: relevant worker tests passed against the isolated PostgreSQL server.
Remaining: action reader, documentation, full gate and review.

2026-11-05 — Add source-backed action reads and serialize overlapping action commits by source/class.
Decision: a cutoff selects the newest retained revision known to the local archive by that time.
Verification: API reader and worker import integration tests pass against isolated PostgreSQL.
Remaining: documentation, full build/smoke gate and PR review.
