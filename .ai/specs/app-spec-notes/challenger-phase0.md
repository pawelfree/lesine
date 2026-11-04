# Phase 0 domain challenger

Execution: sequential fallback. The dispatched reviewer stopped at a usage limit; this pass uses only App Spec §§1–2, its glossary, and `challenger-prompt.md`. Findings were written before revising the model.

## CRITICAL

1. `DailyBar` claims `(instrument_id, session_date, provider)` uniqueness but has no `provider` field. Add provenance to the entity and distinguish raw values from derived adjusted returns.
2. A backtest using today's symbol or today's index constituents in a past decision would leak future information. Keep symbol and membership validity intervals and `known_at` separate; require point-in-time input selection. If historical `known_at` cannot be established, mark the test limited rather than claiming it is leakage-free.
3. `IndicatorResult` lacks input snapshot and revision identity, so a data correction cannot be traced or reproduced. Results must refer to the exact input snapshot and version. Corrections produce a new revision, never an unexplained overwrite.
4. The ten posture bands and the publication rule are external to the entity invariants. State the exact boundaries and that a result calculated after close is actionable no earlier than the next session.

## WARNING

1. `Score`, `posture`, and `allocation` are different concepts; make allocation explicit in the glossary and result.
2. No complete score formula or evaluation protocol exists. This is a Phase 0 blocker, not an implementation detail.
3. Full GPW history is an acquisition target, but provider coverage and rights are unverified. A completeness report is needed before treating an import as complete.
4. The local-only access model is clear, but the runtime security mechanism depends on stack selection.

## OK

- One owner and one local surface match the first-version scope.
- A fixed formula version and immutable test runs support reproducibility.
- Separate acquisition, daily calculation, and historical evaluation have distinct completion events and user value.

## Follow-up on declarative definitions (2026-11-04)

Execution: sequential fallback; review limited to the revised glossary, entities and invariants in App Spec §1, without the drafting rationale.

- CRITICAL resolved: a generated JSON/DSL definition must be validated before activation and its exact schema, bindings, engine semantics and data snapshot must remain identifiable in every result and test. The revised model records those references and forbids mutation of an active version.
- CRITICAL resolved: the first operator set must cover historical universe selection and cross-sectional breadth, not only transforms of one time series. This is explicit in §1.4.
- WARNING open: precise grammar and supported operations still require a feature specification once the App Spec is confirmed. A design that embeds arbitrary code in JSON would violate the owner's decision.
- WARNING open: the first-release registration surface is not selected. It must accept a new validated definition without changing application source, while the previously agreed visual editor remains later scope.

## Completion follow-up

The v0 mathematical factors/weights, 08:30 cutoff, Main Market breadth universe, 90% coverage gate and source freshness rules are now stated in the App Spec and `completion-decisions.md`. Actual provider symbols, historical depth and rights remain external acceptance gates. First-release JSON registration is a documented local import action; the exact CLI/UI mechanism belongs to its feature spec and may not require indicator-specific code changes.
