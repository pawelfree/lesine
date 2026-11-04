# Phase 4 acceptance review

Execution: sequential fallback. Inputs: App Spec §§1–7 and the challenger prompt. DDD criteria were drafted first, then challenged against the personal research outcome.

## DDD criteria kept

- Source revisions, point-in-time availability and immutable snapshots: essential to avoid changing past results silently.
- Validated JSON/DSL definitions and one active version per indicator/session: essential to repeat daily calculations and later add indicators without custom formulas in code.
- Backtest protocol and attempt history: essential to distinguish an untouched test from repeated tuning.
- ETF listing dates and next-session timing: essential to avoid impossible returns.

## PM challenges and cuts

- Do not require complete historical index constituents when a provider cannot supply them. Require an explicit coverage gap and block any study that needs them.
- Defer a visual formula editor, multiple simultaneous active indicators, brokerage execution, automated tax handling and notifications; they do not improve the first end-to-end barometer test.
- Do not make positive backtest performance an acceptance criterion. The product must produce a truthful comparison, including disappointing results.

## Remaining external gates

- A provider account/plan, rights and a sample of each required daily series must be checked before Phase 1/2 can pass. The spec may be confirmed as a product contract while these gates remain visibly unsatisfied; no implementation phase is declared production-ready on this evidence alone.
