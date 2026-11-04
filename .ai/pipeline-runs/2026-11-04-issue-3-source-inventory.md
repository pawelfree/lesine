# Issue #3 — source inventory or explicit lack of access

Goal: Deliver the first GPW source inventory flow, including a usable empty Data page and an evidence-preserving bounded EODHD catalog probe.
Source doc: .ai/specs/2026-11-04-local-gpw-history-with-coverage.md
Issue: #3

## Scope

Implement only history story E01-S01 and its tasks #8–#9. Preserve source identity and classification evidence. A missing key or unsupported entitlement must remain visible as unknown/unavailable. Full EOD bar imports, resumable jobs, actions, snapshots and full-history claims belong to later issues.

## Implementation Plan

### Phase 1: Local shell and access

1. Add forward-only schema migration and private data volume wiring.
2. Add the Data page empty state and same-origin local API guard.

### Phase 2: Source inventory

3. Add normalized source-symbol records and a bounded EODHD catalog adapter.
4. Add safe inventory/probe API and Data page states for available and unavailable sources.
5. Add tests for identity, classification, empty state and access boundaries; document source setup.

## Risks

- Actual GPW coverage and EODHD Free entitlement are unverified until the owner provides a key; fixtures establish behavior but cannot prove real-source acceptance.
- Ticker text cannot be treated as a permanent issuer identity.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Local shell and access

- [ ] 1.1 Add forward-only schema migration and private data volume wiring.
- [ ] 1.2 Add the Data page empty state and same-origin local API guard.

### Phase 2: Source inventory

- [ ] 2.1 Add normalized source-symbol records and a bounded EODHD catalog adapter.
- [ ] 2.2 Add safe inventory/probe API and Data page states for available and unavailable sources.
- [ ] 2.3 Add tests for identity, classification, empty state and access boundaries; document source setup.
