# Quota-efficient EODHD import specification — issue #15

Goals: Write and publish a focused specification for quota-efficient EODHD import batches without implementing the importer.
Spec: [Quota-efficient EODHD import batches](../specs/2026-11-05-eodhd-efficient-import-batches.md)
Status: in-progress

## Commit log

2026-11-05 — Draft and review the focused specification for issue #15.
Decision: coalesce missing dates across months within the existing one-year API span; preserve monthly archives and split HTTP 402 handling into separate work.
Verification: checked the current API/worker code, EODHD pricing, product decisions and independent scope-cohesion feedback.
Remaining: commit and publish the design-only PR, link it to the issue and release the claim.
