# EODHD quota-efficient import batches

Goal: Import a fresh one-year EOD range with one bounded provider request per source identity while preserving durable archive and quota behavior.
Source doc: .ai/specs/implemented/2026-11-05-eodhd-efficient-import-batches.md
Issue: #15

## Scope

Change missing-range planning in the API, cover the new ranges and existing worker guarantees with isolated tests, and update the README. Existing persisted jobs, monthly archives, route shapes and the worker's provider-error policy remain as specified.

## Implementation Plan

### Phase 1: Planner

1. Coalesce missing dates across months within the API range cap, with integration tests for fresh, partial, legacy and active jobs.

### Phase 2: Import verification

2. Exercise one-year fake-provider requests, reservations, archive publication, retries, corrections and lease recovery in isolated worker integration tests.

### Phase 3: Documentation and gates

3. Update README, run build/unit/integration and Compose smoke checks, record evidence, and prepare the PR for review.

## Risks

Longer chunks widen the work repeated after a failed in-flight request; each retry must reserve a new budget unit. A payload above the existing 5 MB guard fails without publishing coverage. Real EODHD access is unavailable until the owner supplies an entitled token, so fixture evidence must be reported honestly.

## Progress

PR: #17

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Planner

- [x] 1.1 Coalesce missing dates and verify planner boundaries. — 5b5603a

### Phase 2: Import verification

- [x] 2.1 Verify one-year request, budget and archive/recovery invariants. — e7f676e

### Phase 3: Documentation and gates

- [x] 3.1 Update README and complete validation and review. — ec4b206
