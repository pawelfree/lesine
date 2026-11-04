# Historical validation of the GPW barometer

- Date: 2026-11-04
- Category: feature
- Priority signal: high — tests whether the first daily signal is useful
- Risk signal: high — look-ahead, revisions, ETF listing dates and repeated testing
- Routing after owner-selected split: `om-spec-writing "Theoretical WIG validation — brief: .ai/specs/briefs/2026-11-04-lesine-historical-validation.md"` and `om-spec-writing "Three-ETF execution validation — brief: .ai/specs/briefs/2026-11-04-lesine-historical-validation.md"`
- App Spec: `.ai/specs/2026-11-04-app-spec-lesine.md` — source of truth; §§1.3–1.4, 2, 3 WF3, 3.5 Tests, 4, 4.5, 5 US-3.1–3.3, 7 Phase 3, 10 Q02

## Problem

The owner needs to know how the accepted v0 and D03 allocations behaved historically, including return and maximum drawdown against fixed exposure. A WIG index calculation can cover a longer period but is theoretical; a tradable three-ETF basket begins only after the last fund launched. Results need saved assumptions and data lineage to avoid presenting overfit or look-ahead as evidence.

## Agreed direction

- The owner chose two feature specs: the theoretical WIG test can ship independently; the three-ETF execution test extends its shared protocol, replay and report contracts. Both remain required to complete App Spec WF3.

- US-3.1: register an immutable JSON backtest protocol distinct from the indicator definition; ETF weights, execution timing, costs and benchmark live in the protocol, with no globally hard-coded basket weight.
- US-3.2: run separate theoretical WIG and BETA ETF WIG20TR/mWIG40TR/sWIG80TR execution tests; compare each with fixed exposure to the same index/basket over its own valid dates; incomplete coverage blocks only the affected test.
- US-3.3: show saved runs, revisions, data gaps, publication-time certainty and untouched versus exploratory labels. A changed protocol or input snapshot creates another run.
- First research defaults in `app-spec-notes/completion-decisions.md`: signal from session `t` may rebalance at session `t+1` close; costs 0/10/30 bp one-way notional; 0% cash; last 25% eligible sessions held out with at least 252 sessions. ETF weights are required per JSON protocol. These defaults were approved with the App Spec, not found to be optimal.
- Capability ladder: new Indicator research module, 10 provisional atomic commits in §4/`app-spec-notes/commit-plan.md`; no platform feature is claimed.

## Resolved unknowns

| Question | Answer from App Spec |
|---|---|
| User and surface | One local `owner`; Tests `/tests`, History `/history`. |
| Owned entities | BacktestProtocolVersion and BacktestRun, plus referenced indicator/policy versions and DataSnapshot; typed fields in §1.4. |
| Two test types | WIG index signal test and actual three-ETF execution test, labeled separately. No synthetic ETF history before listing. |
| Comparisons | Return, maximum drawdown, turnover, costs, coverage, baseline difference and data/timing limitations; no positive outcome promised. |
| Protocol | Immutable per run; basket weights configurable in JSON and summing to 100% of equity sleeve; benchmark holds the same basket weights at 100% exposure. |
| Phase acceptance | §7 Phase 3: reproducible saved runs with point-in-time gates or explicit conservative timing limitations; chronological untouched holdout. |

## Non-goals

- No automatic trading, tax optimization, claim that WIG itself is purchasable, or investment-performance guarantee.
- No backfilling ETF returns before its listing or silently reusing a viewed holdout as untouched.

## Affected areas (if known)

- Indicator research module reuses the daily JSON/DSL evaluator and immutable Market archive snapshots.
- Tests page with two separately labeled report modes, cost sensitivity and version comparison.
