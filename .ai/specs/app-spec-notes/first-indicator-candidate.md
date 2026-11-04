# First barometer candidate v0 — mathematical parameters accepted

The owner confirmed a hybrid first candidate: GPW trend and market breadth, copper, PLN and bond yields. On 2026-11-04 the owner accepted the v0 weights and trailing 252-session percentile normalization below as the first hypothesis to test. The owner also accepted a decision cutoff of 08:30 Europe/Warsaw before the next scheduled GPW session. Exact source series, minimum breadth coverage, permitted input age and source entitlement still require a coverage check. The mathematical parameters are fixed for v0; the complete executable definition cannot be activated or evaluated on an untouched period until those bindings and freshness rules are declared.

The owner also confirmed that indicator-specific formulas are declarative DSL/JSON definitions, not new source code per indicator. The table below describes one candidate definition for a shared interpreter. A future generator may produce a candidate JSON document, but activation requires schema, input, timing and output validation. The first release needs only one registered definition, with the engine already capable of evaluating later definitions under the same contract.

The first engine contract must be able to express dated source selection, session-aligned lags, log returns, historical instrument-universe filters, a rolling simple moving average, cross-sectional share above a threshold, a trailing percentile rank and a weighted sum. These are semantic capabilities, not a proposed JSON syntax. A future indicator may use only the operations already supported by its recorded schema/engine version; introducing a new operation creates a new engine version. A definition must reference named data inputs rather than embed provider credentials or fetch data itself.

## Proposed v0 calculation

One score per GPW session `t`, calculated after that session from the latest source observations known by 08:30 Europe/Warsaw before the next scheduled GPW session. Every input and its known-at time are recorded in the calculation snapshot. A missing required input blocks publication; the system does not redistribute weights. A value arriving after the cutoff may support a late historical calculation, but cannot be used to simulate a decision at the upcoming session's open.

| Component | Raw feature on session `t` | Weight | Hypothesized high-score direction |
|---|---|---:|---|
| GPW trend | `ln(WIG_close_t / WIG_close_(t-60 GPW sessions))` | 30% | Stronger broad-market trend |
| GPW breadth | Share of eligible GPW ordinary shares whose split-adjusted close is above their trailing 200-observation SMA | 25% | More shares participating |
| Copper | `ln(copper_price_asof_t / copper_price_asof_(t-60 GPW sessions))` | 20% | Stronger industrial-demand proxy |
| PLN | `-ln(USDPLN_asof_t / USDPLN_asof_(t-60 GPW sessions))` | 15% | Stronger PLN |
| Bond yields | `DGS10_asof_t - DGS2_asof_t` in percentage points | 10% | Steeper US term spread |

These directions and weights are hypotheses, not measured predictive relationships. The US spread is a candidate proxy whose sign is now part of the accepted v0 mathematics; its relevance to GPW remains unproven. A daily copper market series is mandatory for this candidate. EODHD's `COPPER` commodity series is monthly and does not satisfy it.

For each feature, use its 252 **previous** eligible GPW-session feature values as a rolling reference. The component score is `100 × (number of previous values below current + 0.5 × number equal to current) / 252`. This yields 0–100 without fitting to future observations. The barometer score is `0.30 × trend + 0.25 × breadth + 0.20 × copper + 0.15 × PLN + 0.10 × yield-spread` component scores, retained with full precision before the D03 band mapping. No result is published before 252 previous complete feature values and each component's own lookback exist.

The owner confirmed that breadth uses ordinary shares listed on the GPW Main Market on session `t`, including shares delisted later. NewConnect history remains in the target local archive but is excluded from this component. Bonds, funds, rights and other non-share instruments are excluded. A share contributes to the numerator and denominator only when it has a valid split-adjusted close and trailing 200-observation SMA; separately report how many eligible shares lacked enough data. A minimum coverage ratio must be predeclared before judging the indicator. Index membership is stored for future studies but this candidate's breadth does not require WIG constituent history. The full available GPW archive remains a separate acquisition target.

The same as-of selection rule applies in live use and backtests. A stale or missing source input blocks that session's on-time result; the exact permitted age remains to be set. Corrections create a new snapshot and result revision. This proposal does not train weights on historical outcomes; any weight changes create a new version and require a fresh untouched evaluation period.

## Evidence and feasibility gates

- EODHD documents WIG under its Warsaw exchange listing, but the actual first available date and plan entitlement need account-level verification. [WAR listing](https://eodhd.com/exchange/WAR?page=6), [EOD history](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes).
- EODHD documents active and delisted symbol lists for the WAR exchange; history depth and identity changes still need measurement. [Symbol list](https://eodhd.com/financial-apis/exchanges-api-list-of-tickers-and-trading-hours).
- EODHD's commodity `COPPER` is monthly with a delayed release. A separate daily copper futures or proxy series must be verified before this candidate can run daily. [Commodities](https://eodhd.com/financial-apis/commodities-api-historical-prices-for-oil-gas-metals-agriculture-beta).
- FRED's `DGS2`/`DGS10` are daily. Use their as-of releases, not the observation date alone. [DGS2](https://fred.stlouisfed.org/series/DGS2/), [DGS10](https://fred.stlouisfed.org/series/DGS10/), [ALFRED real-time periods](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html).

Next decision: fix source bindings, permitted input age, breadth coverage and the remaining backtest protocol before examining performance. Do not interpret the 0–100 output as a probability. Any later mathematical changes create v1 or another version; they do not rewrite v0.

## First test framework accepted by the owner

The owner accepted two outputs: (1) a longer theoretical test of suggested allocation against constant 100% WIG index exposure, and (2) a shorter execution test on a basket of BETA ETF WIG20TR, mWIG40TR and sWIG80TR, with realistic costs. The basket test can begin only after all three funds were actually listed; the issuer places the first two launches in 2019 and the sWIG80TR launch in 2021. Do not present the WIG index itself as directly purchasable, and do not splice a modern ETF into years before it existed. Apply each session's signal no earlier than the next GPW session. Report return, maximum drawdown and turnover at several cost levels, and reserve a later period that is not used to select the formula. Use the same DSL definition version and engine in live calculations and historical simulation. Basket weights, execution-price convention, cash return, dividend handling, cost levels and holdout boundary belong to a separate versioned JSON backtest protocol. They can differ between runs without changing the indicator definition or application code; each protocol is fixed before its run, and variants explored during research are not treated as untouched validation. [Issuer fund list](https://betaetf.pl/nasze-fundusze), [issuer history](https://betaetf.pl/o-nas/).
