# Phase 1 workflow challenger

Execution: sequential fallback. Review scope: App Spec §3 and §1.3 glossary against `challenger-prompt.md`; the dispatched reviewer was unavailable at a usage limit.

## CRITICAL

1. WF2 cannot be accepted without a complete indicator formula and required input set. Until defined, its readiness gate and publication deadline have no concrete start point. Keep WF2 blocked for implementation.
2. WF3 cannot claim valid point-in-time performance until the execution timing, return convention, benchmark, costs and holdout protocol are fixed. Keep WF3 blocked for implementation.

## WARNING

1. WF1's target is a known coverage status for every expected instrument, not an assertion that all history exists. The expected GPW universe and legal data retention rights need evidence.
2. A correction in WF1 can make WF2 and WF3 outputs stale. Preserve old runs and show the affected results rather than silently rewriting them.
3. A market indicator may calculate with some macro series that are updated less often than GPW sessions. The readiness gate must distinguish an allowed carry-forward observation from a missing value.

## OK

- The three workflows have distinct triggers and completion criteria.
- Each workflow names a measurable operational outcome and failure paths.
- The UI exposes blocked states and coverage rather than implying a daily result always exists.

## Follow-up on declarative tests (2026-11-04)

Execution: sequential fallback; review limited to the revised WF3, glossary and entity fields.

- CRITICAL resolved: ETF basket weights and transaction assumptions are now part of an immutable JSON `BacktestProtocolVersion`, not hard-coded into the indicator definition. Runs reference the protocol, definition, signal policy and data snapshot separately.
- WARNING open: the first protocol's execution timing, cost levels and cash/dividend treatment still need a declared choice before any performance result is interpreted. The application can support variants without choosing one global ETF weighting in the App Spec.

## Completion follow-up

`completion-decisions.md` now declares conservative next-session close execution, 0/10/30 bp sensitivity, 0% cash and a 25% chronological holdout with a minimum 252 sessions. Basket weights remain a required parameter in each JSON test protocol, as the owner requested. These defaults are proposed for App Spec confirmation; they are not measured best settings.
