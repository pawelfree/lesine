# EODHD catalog refresh from Data UI

Status: complete
Source doc: .ai/specs/implemented/2026-11-05-eodhd-catalog-ui-refresh.md
Issue: #18
Spec PR: #19

## Goal

Let the local owner acquire the WAR catalog from `/data`, inspect current tickers, confirm a replacement and retain historical identities and prices.

## Scope

Durable catalog job, atomic current membership, local API, worker integration, UI action/confirmation/status, tests and README. No scheduled refresh, cost UI, EOD price redesign or market-classification claim.

## Risks

The catalog view and new EOD job planning change semantics. Keep the legacy list visible after migration, publish only complete active+delisted pairs, and test rollback/failure paths. Live EODHD entitlement is unavailable; fixtures establish mechanism correctness.

## Implementation Plan

### Phase 1: Durable catalog

1.1 Add migration 005 with jobs, members, current pointer and legacy backfill.
1.2 Implement catalog-only worker retrieval, staging, lease, quota and atomic publication; keep CLI probe behavior.
1.3 Add protected API job routes, current-list query and EOD import planning update.

### Phase 2: Owner UI

2.1 Add `/data` action, current-list confirmation, progress, failure and retry states.
2.2 Add tests, documentation and Compose/browser verification; run the configured gate and review.

## Progress

PR: #20

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Durable catalog

- [x] 1.1 Add migration 005 with jobs, members, current pointer and legacy backfill. — b7652f2
- [x] 1.2 Implement catalog-only worker retrieval, staging, lease, quota and atomic publication; keep CLI probe behavior. — ed22b06
- [x] 1.3 Add protected API job routes, current-list query and EOD import planning update. — 286ac21

### Phase 2: Owner UI

- [x] 2.1 Add `/data` action, current-list confirmation, progress, failure and retry states. — 383523f
- [x] 2.2 Add tests, documentation and Compose/browser verification; run the configured gate and review. — 11e9cde
