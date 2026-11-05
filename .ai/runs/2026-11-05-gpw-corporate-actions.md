# GPW corporate actions import

Goals: Implement quota-aware EODHD dividend and split import with immutable source-backed revisions, retaining existing EOD behavior.
Specification: [2026-11-05-gpw-corporate-actions.md](../specs/2026-11-05-gpw-corporate-actions.md) (design PR #26)
Status: in-progress

2026-11-05 — Add the phased implementation plan and open an isolated implementation PR.
Decision: use the existing importer, local budget and raw-file manifest boundary; track action kind per chunk.
Verification: plan and journal staged diff checked before commit.
Remaining: schema, importer, correction handling and validation.
