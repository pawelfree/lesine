# GPW corporate actions import

Goals: Implement quota-aware EODHD dividend and split import with immutable source-backed revisions, retaining existing EOD behavior.
Specification: [2026-11-05-gpw-corporate-actions.md](../specs/2026-11-05-gpw-corporate-actions.md) (design PR #26)
Status: done

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

2026-11-05 — Mark correction/read step 2.1 complete at 923dbad.
Decision: retain tombstones and earlier values; the reader selects by local knowledge cutoff.
Verification: action correction, withdrawal, immutability and reader tests passed.
Remaining: documentation, full build/smoke gate and PR review.

2026-11-05 — Document action import, quota impact and migration compatibility.
Decision: the EOD Data-page status remains EOD-only; action display belongs to issue #7.
Verification: Node 24 Compose build/health and relevant PostgreSQL integration suites pass; test infrastructure removed.
Remaining: update progress, run authoritative PR review and fix any findings.

2026-11-05 — Mark verification/documentation step 2.2 complete at 4817ea1.
Decision: the implementation plan stays in progress until authoritative review finishes.
Verification: migration, reader, importer and EOD regression tests passed; Compose was cleaned up.
Remaining: PR review and any required fixes.

2026-11-05 — Fix review finding: a provider 404 now fails the job without repeated quota spend.
Decision: treat unknown action symbols as a permanent source-unavailable result, preserving prior chunks.
Verification: targeted PostgreSQL import test and the configured Node 24 build pass.
Remaining: publish fix, re-review and finish PR handoff.

2026-11-05 — Complete action-import PR #27 after autofix and re-review.
Decision: GitHub rejects author approval; the favorable review is recorded as a comment for independent follow-up.
Verification: Node 24 build and relevant PostgreSQL tests passed after the fix; no temporary infrastructure remains.
Remaining: independent high-risk review and QA before merge.

2026-11-05 — Commit adds archive-generation wiring for installations where snapshot migration 010 ran first.
Decision: migration 010 supplies the same trigger when action migration 008 ran first.
Remaining: cross-order migration test, build, re-review and PR update.

2026-11-05 — Commit adds a PostgreSQL regression test for action migration after snapshot generation.
Verification: the conditional trigger increments and records generation 2; six import regressions and full build pass.
Remaining: re-review and final PR handoff.

2026-11-05 — Commit records the completed migration-order step and re-review of PR #27.
Verification: both migration orders and the new PostgreSQL regression test pass; no code blocker remains.
Remaining: independent review and QA gate before merge.
