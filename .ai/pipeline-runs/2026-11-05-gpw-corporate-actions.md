# GPW corporate actions

Status: in-progress
Source doc: .ai/specs/2026-11-05-gpw-corporate-actions.md
Issue: #6
Spec PR: #26

## Goal

Import EODHD dividends and splits with the existing quota-aware job machinery, retain raw responses and append-only revisions, and preserve all current EOD behavior.

## Scope

NestJS import API, worker, migration, archive backup checks, tests and concise README usage. No index constituents, identity links, snapshot service or new Data page report.

## Risks

Changing job/chunk/manifest constraints can regress the EOD importer. Action event matching and historical availability must remain explicit. Preserve the pre-migration backup/restore path.

## Implementation Plan

### Phase 1: Action storage and scheduling

1. Extend schema and import-job planning for per-kind action requests without changing EOD requests.
2. Add dividend and split normalizers and worker dispatch through the existing budget, lease and file-manifest path.

### Phase 2: Corrections and verification

3. Retain duplicate/corrected/withdrawn action revisions and expose source-backed reads for future snapshots.
4. Verify integration, backup/restore and local Compose behavior, then document usage and source limits.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Action storage and scheduling

- [x] 1.1 Extend schema and import-job planning for per-kind action requests without changing EOD requests. — 93522fc
- [x] 1.2 Add dividend and split normalizers and worker dispatch through the existing budget, lease and file-manifest path. — ac0a97d

### Phase 2: Corrections and verification

- [x] 2.1 Retain duplicate/corrected/withdrawn action revisions and expose source-backed reads for future snapshots. — 923dbad
- [ ] 2.2 Verify integration, backup/restore and local Compose behavior, then document usage and source limits.
