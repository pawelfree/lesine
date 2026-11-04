# Issue #10 — resumable EOD import

Goal: Import bounded EODHD daily-bar ranges with durable progress and quota-safe retries.

Scope: PostgreSQL job/chunk schema, worker scheduling and lease fencing, fake-provider integration tests, job status API and minimal Data-page progress. No canonical bar revisions or full coverage calculation; those belong to following backlog items.

Source doc: .ai/specs/2026-11-04-local-gpw-history-with-coverage.md

## Implementation Plan

### Phase 1: Durable state

1. Add migration, job scheduling, chunk checkpoint and lease rules.
2. Add integration tests for duplicate scheduling, restart and stale lease fencing.

### Phase 2: Bounded fetching

3. Add a worker that fetches EODHD missing ranges under the shared daily budget and records safe failure states.
4. Test fake-provider success, quota, auth, network and restart paths.

### Phase 3: Progress

5. Expose sanitized job status and resume operations through the local API.
6. Display job progress on the Data page and run build, tests and local smoke checks.

## Risks

Quota records calls reserved by Lesine, not calls made outside it. This issue stores response hashes and chunk checkpoints; immutable response manifests and canonical bars follow in issue #11.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Durable state

- [ ] 1.1 Add migration, job scheduling, chunk checkpoint and lease rules.
- [ ] 1.2 Add integration tests for duplicate scheduling, restart and stale lease fencing.

### Phase 2: Bounded fetching

- [ ] 2.1 Add a worker that fetches EODHD missing ranges under the shared daily budget and records safe failure states.
- [ ] 2.2 Test fake-provider success, quota, auth, network and restart paths.

### Phase 3: Progress

- [ ] 3.1 Expose sanitized job status and resume operations through the local API.
- [ ] 3.2 Display job progress on the Data page and run build, tests and local smoke checks.
