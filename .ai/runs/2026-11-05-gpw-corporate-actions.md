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
