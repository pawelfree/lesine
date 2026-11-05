# Point-in-time archive snapshots

Status: complete
Source doc: .ai/specs/2026-11-05-point-in-time-archive-snapshots.md
Goal: Persist immutable, provenance-checked revision references for reproducible historical research.

## Scope

- Bounded, repeatable-read EOD snapshot creation under an explicit availability policy.
- Immutable read path with exact revision IDs and checked response-file hashes.
- Optional action and identity adapters that never imply verified publication time.
- Internal contract only; no public mutation endpoint or indicator computation.

## Risks

- First local import is not provider publication evidence.
- Revision pinning must survive provider corrections and file restore.
- Additive migration must remain independent of the separate action and identity PRs.

## Progress

PR: #29

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Immutable EOD snapshots

- [x] 1.1 Add schema, archive generation and bounded repeatable-read creator. — a470a4d
- [x] 1.2 Test cutoff, correction, unknown availability and atomic failure. — a470a4d

### Phase 2: Provenance-checked reading

- [x] 2.1 Implement read contract with exact revision and file verification. — a470a4d
- [x] 2.2 Test old snapshot after correction, missing file and backup/restore. — a470a4d

### Phase 3: Optional archive classes and review

- [x] 3.1 Pin action revisions and identity batch only when their tables exist. — a470a4d
- [x] 3.2 Run full build, isolated PostgreSQL and Compose smoke; review and fix findings. — 073b5d7
