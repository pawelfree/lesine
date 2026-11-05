# EODHD catalog refresh UI specification

Goals: Specify issue #18's catalog download, visible current ticker list and confirmed refresh; publish a reviewable design PR.
Specification: [2026-11-05-eodhd-catalog-ui-refresh.md](../specs/2026-11-05-eodhd-catalog-ui-refresh.md)
Status: done

2026-11-05 — Drafted the catalog-only worker, atomic current-list publication, API and `/data` flow; reviewed scope with a fresh-context agent.
Decision: preserve historical identities and raw files, publish only both complete WAR lists; one reversible instrument-type default is recorded.
Verification: Node 24 build passed outside the restricted sandbox; no runtime files changed. Remaining: publish the spec PR and hand off issue #18.

2026-11-05 — Published ready spec PR #19, posted the autonomous default and run summary, and returned issue #18 to its owner.
Decision: omit visuals because no prepared test-environment descriptor exists; the PR records this evidence limit.
Remaining: specification review and later implementation are separate tasks.

2026-11-05 — Addressed review findings on published-catalog status and stale staged responses; updated affected API, UI and test contracts.
Decision: cap staged-pair freshness at 24 hours and require local budget for all missing parts before fetching.
Verification: prior Node 24 build passed; remaining: re-review revised spec and publish the corrected PR head.

2026-11-05 — Re-reviewed and published the corrected spec in PR #19; the design findings are resolved and Node 24 build passed.
Pitfall: GitHub rejects formal approval of an own PR; automatic approval review rejected `merge-queue` because it might trigger a merge.
Remaining: an independent or owner review/merge decision; implementation is separate work.
