# Phase 2 story challenger

Execution: sequential fallback. Review inputs: App Spec §5, §1.3 glossary, and `challenger-prompt.md`. The earlier independent agent stopped at a usage limit.

## CRITICAL found and fixed

- A basket-weight default had been reintroduced in the research-protocol note after the owner explicitly chose protocol-defined weights. Removed it. Each run must supply its own weights; the fixed-exposure baseline uses the same basket weights to isolate the signal.
- US-3.2 must not imply an ETF execution result for dates before the last ETF launched. Its success and failure paths now restrict the execution test to actual common listing history and allow the WIG report to complete separately.

## WARNING retained as explicit gate

- Historical provider timestamps may be unavailable. US-3.3 requires the report to distinguish verified timing from a conservative assumption; it cannot advertise unqualified point-in-time validity.
- Many protocol variants can contaminate the holdout. US-3.3 and the cross-story matrix remove the untouched label after exploratory use.

## OK

- Each of US-1.1–US-3.3 names the owner, an observable result, alternate behavior and persisted failure state.
- The cross-story matrix covers all state-changing stories; read-only coverage/history views do not alter another story's preconditions.
