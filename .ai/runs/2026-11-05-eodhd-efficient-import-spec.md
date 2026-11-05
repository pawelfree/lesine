# Quota-efficient EODHD import specification — issue #15

Goals: Write and publish a focused specification for quota-efficient EODHD import batches without implementing the importer.
Spec: [Quota-efficient EODHD import batches](../specs/2026-11-05-eodhd-efficient-import-batches.md)
Status: done

## Commit log

2026-11-05 — Draft and review the focused specification for issue #15.
Decision: coalesce missing dates across months within the existing one-year API span; preserve monthly archives and split HTTP 402 handling into separate work.
Verification: checked the current API/worker code, EODHD pricing, product decisions and independent scope-cohesion feedback.
Remaining: commit and publish the design-only PR, link it to the issue and release the claim.

2026-11-05 — Record publication of the focused spec in ready PR #16 and its linkage from issue #15.
Decision: keep implementation in a separate PR based on the dedicated spec path; no UI mockup is needed for the unchanged Data page.
Verification: PR body, SDLC labels and issue design-authority link were checked after publication; no runtime files changed.
Remaining: specification review and later implementation of issue #15.
