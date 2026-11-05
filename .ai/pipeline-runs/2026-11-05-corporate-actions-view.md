# Corporate actions view implementation

Status: in-progress
Source doc: .ai/specs/2026-11-05-corporate-actions-view.md
Spec PR: #30

## Goal

Show retained GPW dividends and splits, their revisions, source evidence, and class-specific import state on `/data` without duplicating EOD coverage.

## Scope

Add local read-only NestJS endpoints and an Angular section. Preserve current EOD behavior and do not call EODHD for reads. Move the spec to `implemented/` when this feature is complete, as requested by the owner.

## Implementation Plan

### Phase 1: API

1. Add paginated action and revision endpoints with validated filters and archive-integrity handling; cover them with database integration tests.
2. Add class-filtered import-job status while preserving the existing EOD default; cover parallel classes and error states.

### Phase 2: UI and completion

3. Add the `/data` section with filters, history, loading/empty/error states, and accessible controls; verify it in the browser.
4. Move the completed spec to `implemented/`, fix references, run the full gate, and review the final diff.

## Risks

An ex-date is not publication evidence. Reads must validate manifest hashes without exposing paths. A filtered status query must not alter EOD's default.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: API

- [x] 1.1 Add paginated action and revision endpoints with validated filters and archive-integrity handling; cover them with database integration tests. — 14fa745
- [x] 1.2 Add class-filtered import-job status while preserving the existing EOD default; cover parallel classes and error states. — bd653ba

### Phase 2: UI and completion

- [x] 2.1 Add the `/data` section with filters, history, loading/empty/error states, and accessible controls; verify it in the browser. — 16af982
- [ ] 2.2 Move the completed spec to `implemented/`, fix references, run the full gate, and review the final diff.
