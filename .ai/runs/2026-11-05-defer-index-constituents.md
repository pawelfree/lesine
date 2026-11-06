# Defer GPW index constituents from Epic 2

Goals: Remove historical index-constituent import from issues #6 and #7 and their parent epic while retaining corporate actions, dated identities, correction snapshots and the existing EOD report.
Specification: [2026-11-04-local-gpw-history-with-coverage.md](../specs/2026-11-04-local-gpw-history-with-coverage.md)
Status: done

2026-11-05 — Update GitHub issues #6, #7 and #2 plus the active feature spec and App Spec phase scope.
Decision: EODHD does not document historical GPW index constituents; any later import needs a separately verified source and task.
Verification: read back tracker issues and check staged documentation diff; no runtime code changed.
Remaining: implementation of the revised E02 issues in future tasks.

2026-11-06 — Merge the preserved local deferral commit into the updated main branch.
Decision: keep main's newer API contract and implementation-plan wording where the older specification conflicted.
Remaining: none for this merge.
