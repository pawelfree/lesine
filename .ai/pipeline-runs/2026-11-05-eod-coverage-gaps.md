# Implement EOD coverage and gap view

Status: in-progress
Source doc: .ai/specs/2026-11-05-eod-coverage-gaps.md
Issue: #5
Spec PR: #22

## Goal

Show the owner which GPW EOD observations are archived locally, which requested ranges remain unfinished, and which expected/provider ranges are still unknown.

## Scope

Add a source-free, timestamped coverage API and report storage, then add the `/data` coverage view. Preserve source identities and all current catalog/import contracts. No provider calls, new data classes, trading or completeness claims.

## Implementation Plan

### Phase 1: Report storage and API

1.1 Add forward-only report schema and a consistent, evidence-derived coverage calculator with safe null/stale semantics.
1.2 Add filtered, paginated `GET /api/coverage` and integration tests for unknown scope, identities, gaps, refresh transitions and corrections.

### Phase 2: Data page and verification

2.1 Add accessible report summary, filters, row findings and safe cached/offline states on `/data`, with UI tests.
2.2 Run build/tests and an isolated Compose/browser smoke check, attach evidence, and document any source-sample limit.

## Risks

The report must not infer trading days or full source depth from completed requests. Fingerprinting report inputs and report generation must not fetch EODHD or disturb the running user environment. A migration requires the documented coordinated backup before production rollout.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Report storage and API

- [x] 1.1 Add forward-only report schema and a consistent, evidence-derived coverage calculator with safe null/stale semantics. — 4bf3fa1
- [x] 1.2 Add filtered, paginated `GET /api/coverage` and integration tests for unknown scope, identities, gaps, refresh transitions and corrections. — 4bf3fa1

### Phase 2: Data page and verification

- [ ] 2.1 Add accessible report summary, filters, row findings and safe cached/offline states on `/data`, with UI tests.
- [ ] 2.2 Run build/tests and an isolated Compose/browser smoke check, attach evidence, and document any source-sample limit.
