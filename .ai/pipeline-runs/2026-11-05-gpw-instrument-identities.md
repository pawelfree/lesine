# GPW instrument identities

Status: complete
Source doc: .ai/specs/2026-11-05-gpw-instrument-identities.md
Goal: Publish owner-attested, dated instrument links from a validated local evidence file while preserving prior batches.

## Scope

- Immutable identity batches, links, and a replaceable head pointer.
- Offline validation/import command with private, checksummed file retention.
- Read-only API for linked instruments and unresolved source identities.
- Archive verification and backup of referenced identity files.

## Risks

- A source reference is an owner assertion, not independently verified truth.
- Existing source observations must remain unchanged.
- Migration is forward-only; rollback requires coordinated database and file backup.

## Progress

PR: #28

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Immutable identity model and validation

- [x] 1.1 Add migration for instrument, batch, link and head records. — fc8b8f7
- [x] 1.2 Validate complete local JSON maps, intervals, paths and source references without writes. — fc8b8f7

### Phase 2: Atomic publication and retained evidence

- [x] 2.1 Import validated file as a checksummed private batch and atomically update the head. — fc8b8f7
- [x] 2.2 Include identity evidence in archive verification and backup/restore. — fc8b8f7

### Phase 3: Read-only access and verification

- [x] 3.1 Expose current dated links and paginated unresolved identities. — fc8b8f7
- [x] 3.2 Run build, meaningful PostgreSQL tests, and isolated Compose smoke test; review and fix findings. — 9cf4d2c

### Phase 4: Snapshot migration order

- [x] 4.1 Bind snapshot identity batches regardless of migration order and re-review. — 62ea5a5
