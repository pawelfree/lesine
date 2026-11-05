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
